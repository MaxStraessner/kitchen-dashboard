# Tapo camera mode

The camera feature separates remote control from local video transport. The VPS carries only the
authenticated camera-mode state and its Server-Sent Events (SSE). RTSP credentials and video stay
on the Raspberry Pi and the home network.

## Runtime architecture

```text
Smartphone --HTTPS/HTTP--> VPS API --SSE--> Raspberry Pi browser
                                             |
                                             v
                                   127.0.0.1:8088 gateway
                                             |
                                             v
Tapo 192.168.178.72 --RTSP--> go2rtc --WebRTC/WHEP--> browser
```

The browser opens the dashboard through the loopback-only kiosk gateway. The gateway proxies the
unchanged dashboard and API to the VPS, but resolves `/camera-stream/` locally to go2rtc. This makes
the WHEP request same-origin and avoids CORS, Private Network Access and mixed-content exceptions.
No camera payload traverses the VPS.

The repository currently documents production as direct HTTP on VPS port `18080`. Therefore the
gateway also uses loopback HTTP today. If production is moved to HTTPS with secure `__Host-`
cookies, first terminate HTTPS on the loopback gateway with a certificate trusted by the Pi and
change the kiosk origin plus `AUTH_ALLOWED_ORIGINS` together. Do not disable certificate checks or
launch Chromium with insecure flags.

## VPS configuration

Add these non-secret values to the protected VPS `.env`:

```text
CAMERA_MODE_TIMEOUT_MINUTES=15
CAMERA_STREAM_URL=/camera-stream/api/webrtc?src=tapo
```

Add the kiosk origin to the existing comma-separated origin allow-list while retaining the public
mobile origin:

```text
AUTH_ALLOWED_ORIGINS=http://152.239.117.234:18080,http://127.0.0.1:8088
```

The state is a singleton database row shared by both Uvicorn workers. Activating it updates its
revision and expiry. The backend timeout monitor expires it server-side, and SSE clients receive the
new inactive revision. Every reconnect also receives the current database-backed state. A backend
start resets the state to inactive.

## One-time Raspberry Pi setup

Copy only `deploy/raspberry-pi` to a protected directory on the Pi, then work from that directory:

```bash
cp camera.env.example .env
chmod 600 .env
```

Edit `.env` locally on the Pi. `TAPO_CAMERA_STREAM` must contain the dedicated Tapo camera account;
URL-encode reserved characters in its username or password. Never paste this value into Git, the
VPS environment, browser settings, screenshots or logs.

Validate and start the isolated Pi project:

```bash
docker compose -f compose.camera.yaml config --quiet
docker compose -f compose.camera.yaml up -d
docker compose -f compose.camera.yaml ps
```

Set the Pi kiosk browser's one-time startup URL to:

```text
http://127.0.0.1:8088
```

Log in through that URL once. No browser restart or reload is needed for later camera-mode changes.

## Network exposure

| Component | Binding or destination | Exposure |
| --- | --- | --- |
| Kiosk gateway | `127.0.0.1:8088/tcp` | Pi loopback only |
| go2rtc API/WHEP | `127.0.0.1:1984/tcp` | Pi loopback only; `/api` health and `/api/webrtc` only |
| go2rtc WebRTC media | `127.0.0.1:8555/tcp+udp` | Pi loopback only |
| Tapo RTSP | `192.168.178.72:554/tcp` by default | outbound from Pi inside home LAN |
| VPS dashboard | existing `152.239.117.234:18080/tcp` | unchanged |

Do not forward ports `1984`, `8555` or `8088` on the router or publish them on a LAN interface. The
go2rtc WebUI, config API and RTSP restream server are not exposed. The container is read-only and
loads only the API, streams, RTSP-client and WebRTC modules. go2rtc logging is deliberately disabled
because producer errors in version 1.9.14 can contain the source URL; this prevents credentials from
reaching container logs. The stream is opened lazily when the camera card mounts and its peer
connection, tracks, timers and listeners are closed when the mode ends.

## Acceptance checks

1. Open `http://127.0.0.1:8088` on the Pi and the public dashboard settings on the phone.
2. Activate the camera on the phone and verify the calendar remains visible without a navigation or
   document reload.
3. Verify tasks, shopping and all four information cards are hidden and a single camera card appears.
4. Stop the camera from the phone and from the card; verify the original mounted content returns.
5. Temporarily use a short timeout and verify automatic restoration.
6. Disconnect the camera and verify the error card and retry/stop actions.
7. Repeat on/off at least six times while checking that only one WebRTC peer exists at a time.

The real camera, Raspberry Pi, codec and browser path must be accepted on site. Repository tests can
prove API, state, SSE, UI switching and cleanup logic, but cannot prove a real RTSP/WebRTC frame.
