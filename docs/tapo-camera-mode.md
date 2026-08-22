# Tapo camera mode

The existing camera tile uses a same-origin WHEP/WebRTC endpoint. Production runs one isolated
go2rtc service in the Kitchen Dashboard Compose project; there is no second camera application on
the Raspberry Pi.

## Runtime architecture

```text
Tapo C201 192.168.178.72:554
            |
            | RTSP through the approved Tailscale /32 subnet route
            v
Kitchen Dashboard go2rtc on VPS (internal API only)
            |
            | WHEP signaling through authenticated frontend proxy
            | WebRTC media on VPS Tailscale-IP:18080/udp
            v
Existing camera tile in the Raspberry Pi Chromium browser
```

The Raspberry Pi remains the Tailscale subnet router for exactly `192.168.178.72/32` and the kiosk
browser. go2rtc runs on the VPS because the VPS and its Kitchen Dashboard containers can reach the
camera through that route. No router port forwarding and no public camera port are required.

## Browser protocol decision

WebRTC is used because the existing tile already implements WHEP and it provides low latency with a
single H.264 video track. MSE and HLS would add latency and a second frontend player path without
improving this fixed kiosk route. The client retries failed signaling after an exponential delay,
handles a persistent disconnected state, and closes the old peer, tracks, listeners, and timers
before every new attempt.

## Protected production configuration

The VPS file `/docker/kitchen-dashboard/.env` is root-owned with mode `0600`. It must contain:

```text
CAMERA_MODE_TIMEOUT_MINUTES=15
CAMERA_STREAM_URL=/camera-stream/api/webrtc?src=tapo
CAMERA_WEBRTC_BIND_IP=100.81.227.118
TAPO_CAMERA_STREAM=rtsp://URL_ENCODED_USERNAME:URL_ENCODED_NEW_PASSWORD@192.168.178.72:554/stream1
```

Use a newly rotated dedicated Tapo camera password. URL-encode reserved characters in both account
fields. Enter the value directly in the protected VPS environment; never paste it into chat, Git,
command arguments, Compose output, logs, screenshots, or issue/PR text. Do not run `docker compose
config` without `--quiet`, because its normal output resolves environment values.

After rotating the password in the Tapo app, enter both camera-account fields through the interactive
helper from a local PowerShell terminal. The password input is hidden and is transported through the
SSH terminal, never as a command argument:

```powershell
.\scripts\configure-production-camera.ps1
```

The main stream path for the C201 is `/stream1`. go2rtc opens the RTSP source lazily when a browser
requests the camera. Its logging is disabled because a source failure can otherwise include the
credential-bearing URL.

## Exposure and authorization

| Component | Binding or destination | Exposure |
| --- | --- | --- |
| Dashboard | existing `152.239.117.234:18080/tcp` | unchanged |
| WHEP signaling | `/camera-stream/api/webrtc?src=tapo` | same-origin, valid dashboard session required |
| go2rtc API | `kitchen-dashboard-camera:1984/tcp` | Docker project network only |
| WebRTC media | `100.81.227.118:18080/udp` | VPS Tailscale interface only |
| go2rtc RTSP server | disabled | none |
| Tapo RTSP | `192.168.178.72:554/tcp` | outbound through the exact Tailscale `/32` route |

TCP `18080` already belongs to the Kitchen Dashboard web service. UDP `18080` is a different socket
and is reused for camera media, so no additional port number or other project port is allocated.
The go2rtc Web UI/admin surface and TCP ports `1984`, `554`, `8554`, and `8555` are not published.

Nginx accepts only `POST /camera-stream/api/webrtc?src=tapo`. It rejects other paths, source names,
and WHIP `dst` parameters, then validates the existing dashboard session through the camera status
API before proxying the SDP body. Camera credentials never enter the browser response.

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
2. Confirm no public `1984`, `554`, `8554`, or `8555` listener exists and UDP `18080` is bound only to
   `100.81.227.118`.
3. Confirm an unauthenticated WHEP POST is rejected and a different `src` or `dst` query is rejected.
4. Log in on the Raspberry Pi dashboard, activate **Kamera** from settings, and confirm one live video
   tile appears while the calendar remains mounted.
5. Power off or disconnect the camera, verify the error state, then restore it and confirm the stream
   reconnects automatically without reloading the dashboard.
6. Stop camera mode from the card and from settings; confirm the previous dashboard region returns.
7. Repeat activation/deactivation several times and confirm only one WebRTC peer remains at a time.
8. Reboot/restart the relevant Kitchen Dashboard service and verify the stream route persists without
   changing any other VPS project or Raspberry Pi route.

Repository tests prove state, authorization wiring, UI switching, cleanup, and reconnect behavior.
Only the real Raspberry Pi Chromium session can prove an actual decoded Tapo frame end to end.
