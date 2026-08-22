[CmdletBinding()]
param(
    [string]$SshTarget = "root@152.239.117.234",
    [string]$IdentityFile,
    [string]$ProjectDirectory = "/docker/kitchen-dashboard",
    [string]$TailscaleAddress = "100.81.227.118"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
    $IdentityFile = Join-Path $PSScriptRoot "..\.codex-deploy\kitchen-dashboard-vps-ed25519"
}

if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw "SSH identity file not found: $IdentityFile"
}
if ($SshTarget -notmatch "^[A-Za-z0-9._@:-]+$") {
    throw "SshTarget contains unsupported characters."
}
if ($ProjectDirectory -notmatch "^/[A-Za-z0-9._/-]+$") {
    throw "ProjectDirectory contains unsupported characters."
}
if ($TailscaleAddress -notmatch "^(?:[0-9]{1,3}\.){3}[0-9]{1,3}$") {
    throw "TailscaleAddress must be an IPv4 address."
}

$remoteScript = @'
set -euo pipefail

project_directory="$1"
tailscale_address="$2"
environment_file="$project_directory/.env"

[ "$(id -u)" = "0" ] || { printf 'Run this command through the configured root SSH target.\n' >&2; exit 1; }
test -f "$environment_file" || { printf 'Protected environment file not found.\n' >&2; exit 1; }
[ "$(stat -c '%a' "$environment_file")" = "600" ] || { printf 'Protected environment must have mode 0600.\n' >&2; exit 1; }

printf 'Dedicated Tapo camera username: ' > /dev/tty
IFS= read -r camera_username < /dev/tty
printf 'New dedicated Tapo camera password (hidden): ' > /dev/tty
IFS= read -rs camera_password < /dev/tty
printf '\n' > /dev/tty

[ -n "$camera_username" ] || { printf 'Camera username must not be empty.\n' >&2; exit 1; }
[ -n "$camera_password" ] || { printf 'Camera password must not be empty.\n' >&2; exit 1; }

printf '%s\0%s\0' "$camera_username" "$camera_password" | python3 -c '
import os
import pathlib
import sys
import tempfile
import urllib.parse

environment_path = pathlib.Path(sys.argv[1])
tailscale_address = sys.argv[2]
parts = sys.stdin.buffer.read().split(b"\0")
if len(parts) != 3 or parts[-1] != b"":
    raise SystemExit("Invalid protected input")
username = urllib.parse.quote(parts[0].decode(), safe="")
password = urllib.parse.quote(parts[1].decode(), safe="")
updates = {
    "CAMERA_MODE_TIMEOUT_MINUTES": "15",
    "CAMERA_STREAM_URL": "/camera-stream/api/webrtc?src=tapo",
    "CAMERA_WEBRTC_BIND_IP": tailscale_address,
    "TAPO_CAMERA_STREAM": f"rtsp://{username}:{password}@192.168.178.72:554/stream1",
}
lines = environment_path.read_text(encoding="utf-8").splitlines()
result = []
seen = set()
for line in lines:
    key = line.split("=", 1)[0] if "=" in line and not line.lstrip().startswith("#") else None
    if key in updates:
        result.append(f"{key}={updates[key]}")
        seen.add(key)
    else:
        result.append(line)
for key, value in updates.items():
    if key not in seen:
        result.append(f"{key}={value}")
fd, temporary_name = tempfile.mkstemp(prefix=".env.camera-", dir=environment_path.parent)
try:
    os.fchmod(fd, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8", newline="\n") as handle:
        handle.write("\n".join(result) + "\n")
        handle.flush()
        os.fsync(handle.fileno())
    os.replace(temporary_name, environment_path)
finally:
    if os.path.exists(temporary_name):
        os.unlink(temporary_name)
' "$environment_file" "$tailscale_address"

unset camera_username camera_password
chmod 600 "$environment_file"
printf 'Protected camera configuration updated without printing credentials.\n'
'@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$encodedRemoteScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

& ssh -tt -i $IdentityFile -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes `
    $SshTarget "echo $encodedRemoteScript | base64 -d | bash -s -- '$ProjectDirectory' '$TailscaleAddress'"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
