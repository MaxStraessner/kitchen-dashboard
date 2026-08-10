[CmdletBinding()]
param(
    [string]$SshTarget = "root@152.239.117.234",
    [string]$IdentityFile,
    [string]$ProjectDirectory = "/docker/kitchen-dashboard",
    [string]$ComposeFile = "deploy/compose.prod.yaml",
    [string]$EnvironmentFile = ".env",
    [string]$ExpectedOrigin = "https://github.com/MaxStraessner/kitchen-dashboard.git",
    [switch]$DryRun
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
    $IdentityFile = Join-Path $PSScriptRoot "..\.codex-deploy\kitchen-dashboard-vps-ed25519"
}

function Assert-SafeValue {
    param(
        [string]$Name,
        [string]$Value,
        [string]$Pattern
    )

    if ($Value -notmatch $Pattern) {
        throw "$Name contains unsupported characters."
    }
}

Assert-SafeValue -Name "SshTarget" -Value $SshTarget -Pattern "^[A-Za-z0-9._@:-]+$"
Assert-SafeValue -Name "ProjectDirectory" -Value $ProjectDirectory -Pattern "^/[A-Za-z0-9._/-]+$"
Assert-SafeValue -Name "ComposeFile" -Value $ComposeFile -Pattern "^[A-Za-z0-9._/-]+$"
Assert-SafeValue -Name "EnvironmentFile" -Value $EnvironmentFile -Pattern "^[A-Za-z0-9._/-]+$"
Assert-SafeValue -Name "ExpectedOrigin" -Value $ExpectedOrigin -Pattern "^https://github\.com/[A-Za-z0-9_.-]+/[A-Za-z0-9_.-]+\.git$"

if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw "SSH identity file not found: $IdentityFile"
}

if ($DryRun) {
    Write-Output "Dry run only. No SSH connection, Git update, Docker build, or VPS change was made."
    Write-Output "Target: $SshTarget"
    Write-Output "Project: $ProjectDirectory"
    Write-Output "Compose: $ComposeFile"
    return
}

$remoteScript = @'
set -euo pipefail

project_directory="$1"
compose_file="$2"
environment_file="$3"
expected_origin="$4"
main_branch="main"

fail() {
  printf 'DEPLOYMENT FAILED: %s\n' "$*" >&2
  exit 1
}

cd "$project_directory" || fail "project directory does not exist: $project_directory"
test -d .git || fail "project directory is not a Git checkout"
test -f "$compose_file" || fail "Compose file does not exist: $compose_file"
test -f "$environment_file" || fail "protected environment file does not exist: $environment_file"
[ "$(stat -c '%a' "$environment_file")" = "600" ] || fail "protected environment file must have mode 0600"

origin_url="$(git remote get-url origin)"
[ "$origin_url" = "$expected_origin" ] || fail "origin does not match the approved GitHub repository"

if [ -n "$(git status --porcelain --untracked-files=no)" ]; then
  fail "tracked deployment files have local modifications; reconcile them intentionally before deploying"
fi

git fetch --prune origin "+refs/heads/$main_branch:refs/remotes/origin/$main_branch"
git checkout --quiet "$main_branch"
previous_commit="$(git rev-parse HEAD)"
git pull --ff-only origin "$main_branch"

deployed_commit="$(git rev-parse HEAD)"
github_commit="$(git rev-parse "origin/$main_branch")"
[ "$deployed_commit" = "$github_commit" ] || fail "VPS main ($deployed_commit) differs from origin/main ($github_commit); refusing to deploy an unmerged or divergent commit"

compose=(docker compose --env-file "$environment_file" -f "$compose_file")

if [ "$previous_commit" != "$deployed_commit" ]; then
  backup_directory="$project_directory/backups"
  backup_file="$backup_directory/predeploy-$(date -u +%Y%m%dT%H%M%SZ).sql.gz"
  mkdir -p "$backup_directory"
  umask 077

  printf 'Creating PostgreSQL backup: %s\n' "$backup_file"
  "${compose[@]}" exec -T kitchen-dashboard-postgres sh -c 'pg_dump -U "$POSTGRES_USER" -d "$POSTGRES_DB"' | gzip -c > "$backup_file"
  test -s "$backup_file" || fail "database backup is empty: $backup_file"

  "${compose[@]}" build kitchen-dashboard-api kitchen-dashboard-web
  "${compose[@]}" up -d
else
  printf 'Git commit already deployed; skipping backup and image build.\n'
fi

wait_for_healthy_service() {
  service="$1"
  attempt=1
  while [ "$attempt" -le 30 ]; do
    container_id="$("${compose[@]}" ps -q "$service")"
    if [ -n "$container_id" ]; then
      health="$(docker inspect --format '{{if .State.Health}}{{.State.Health.Status}}{{else}}{{.State.Status}}{{end}}' "$container_id")"
      if [ "$health" = "healthy" ]; then
        return 0
      fi
    else
      health="not-running"
    fi
    sleep 4
    attempt=$((attempt + 1))
  done
  fail "service did not become healthy: $service ($health)"
}

for service in kitchen-dashboard-postgres kitchen-dashboard-api kitchen-dashboard-web; do
  wait_for_healthy_service "$service"
done

web_health="$("${compose[@]}" exec -T kitchen-dashboard-web wget -q -O - http://127.0.0.1:8080/healthz)"
[ "$web_health" = "healthy" ] || fail "frontend health endpoint returned an unexpected response"

api_health="$("${compose[@]}" exec -T kitchen-dashboard-web wget -q -O - http://127.0.0.1:8080/api/v1/health)"
printf '%s' "$api_health" | grep -q '"status":"healthy"' || fail "API health endpoint did not report healthy"
printf '%s' "$api_health" | grep -q '"database":{"status":"healthy"}' || fail "database component did not report healthy"

"${compose[@]}" ps
printf 'VPS deployed: %s\n' "$deployed_commit"
'@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$encodedRemoteScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$sshArguments = @(
    "-i", $IdentityFile,
    "-o", "BatchMode=yes",
    "-o", "ConnectTimeout=20",
    "-o", "StrictHostKeyChecking=yes"
)

& ssh @sshArguments $SshTarget "echo $encodedRemoteScript | base64 -d | bash -s -- '$ProjectDirectory' '$ComposeFile' '$EnvironmentFile' '$ExpectedOrigin'"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}
