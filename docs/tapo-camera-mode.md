# Tapo camera mode

The camera tile uses an authenticated same-origin progressive MP4 stream. Production runs one
isolated go2rtc service in the Kitchen Dashboard Compose project; there is no second camera
application on the Raspberry Pi.

## Runtime architecture

```text
Tapo C201 192.168.178.72:554
            |
            | RTSP through the approved Tailscale /32 subnet route
            v
Kitchen Dashboard go2rtc on VPS (internal API only)
            |
            | H.264 in progressive MP4 through the authenticated Nginx proxy
            | existing Kitchen Dashboard 18080/tcp listener
            v
Existing camera tile in the Raspberry Pi Chromium browser
```

The Raspberry Pi remains the Tailscale subnet router for exactly `192.168.178.72/32` and the kiosk
browser. go2rtc runs on the VPS because the VPS and its Kitchen Dashboard containers can reach the
camera through that route. No router port forwarding and no camera port are required.

## Browser protocol decision

Progressive MP4 is used because Chromium can decode the camera's H.264 track natively and receive it
through the existing authenticated dashboard HTTP connection. This avoids a separate WebRTC media
socket and a direct browser route to a private VPS candidate. The tile becomes live only after the
video element actually starts playing. Initial playback failures and persistent stalls trigger an
automatic reconnect with an exponential delay.

## Protected production configuration

The VPS file `/docker/kitchen-dashboard/.env` is root-owned with mode `0600`. It must contain:

```text
CAMERA_MODE_TIMEOUT_MINUTES=15
CAMERA_STREAM_URL=/camera-stream/api/stream.mp4?src=tapo
TAPO_CAMERA_STREAM=rtsp://URL_ENCODED_USERNAME:URL_ENCODED_PASSWORD@192.168.178.72:554/stream1
```

URL-encode reserved characters in both camera-account fields. Enter the value directly in the
protected VPS environment; never paste it into chat, Git,
command arguments, Compose output, logs, screenshots, or issue/PR text. Do not run `docker compose
config` without `--quiet`, because its normal output resolves environment values.

Enter both camera-account fields through the interactive helper from a local PowerShell terminal.
The password input is hidden and is transported through the SSH terminal, never as a command
argument:

```powershell
.\scripts\configure-production-camera.ps1
```

The main stream path for the C201 is `/stream1`. go2rtc opens the RTSP source lazily when a browser
requests the camera. Its logging is disabled because a source failure can otherwise include the
credential-bearing URL.

## Exposure and authorization

| Component | Binding or destination | Exposure |
| --- | --- | --- |
| Dashboard and MP4 stream | existing `152.239.117.234:18080/tcp` | unchanged, valid dashboard session required |
| MP4 upstream | `kitchen-dashboard-camera:1984/tcp` | Docker project network only |
| go2rtc RTSP server | disabled | none |
| Tapo RTSP | `192.168.178.72:554/tcp` | outbound through the exact Tailscale `/32` route |

The camera container publishes no host port. The go2rtc Web UI/admin surface and TCP ports `1984`,
`554`, `8554`, and `8555` are not published. The previous UDP media mapping is not needed.

Nginx accepts only `GET /camera-stream/api/stream.mp4?src=tapo`. It rejects other paths, source
names, query parameters, and methods, then validates the existing dashboard session through the
camera status API before proxying the stream. Proxy buffering and caching are disabled. Camera
credentials never enter the browser response.

## Deployment and health

The normal production deployment validates Compose quietly, creates database and media backups for
a changed Git commit, builds only Kitchen Dashboard images, and reconciles only this Compose project.
It waits for PostgreSQL, API, camera, and web health checks. An unchanged commit still runs `compose
up -d`, so a rotated protected camera credential is applied safely.

The go2rtc health check verifies its internal API process, not the camera itself. This distinction is
intentional: a powered-off camera must show the tile's retry state without making the entire Kitchen
Dashboard unhealthy.

## Production acceptance

1. Confirm the four Kitchen Dashboard services are healthy and the exact merged `main` commit is
   deployed.
2. Confirm the camera container publishes no host port and no public `1984`, `554`, `8554`, or `8555`
   listener exists.
3. Confirm an unauthenticated MP4 request is rejected and a different source, query, or method is
   rejected.
4. Log in on the Raspberry Pi dashboard, activate **Kamera** from settings, and confirm one decoded
   live video tile appears while the calendar remains mounted.
5. Power off or disconnect the camera, verify the error state, then restore it and confirm the stream
   reconnects automatically without reloading the dashboard.
6. Stop camera mode from the card and from settings; confirm the previous dashboard region returns.
7. Repeat activation/deactivation and confirm only one MP4 stream request remains at a time.
8. Restart the relevant Kitchen Dashboard service and verify the stream route persists without
   changing any other VPS project or Raspberry Pi route.

Repository tests prove state, authorization wiring, UI switching, cleanup, and reconnect behavior.
Only the real Raspberry Pi Chromium session can prove an actual decoded Tapo frame end to end.
