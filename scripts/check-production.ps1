[CmdletBinding()]
param(
    [string]$SshTarget = "root@152.239.117.234",
    [string]$IdentityFile,
    [string]$ProjectDirectory = "/docker/kitchen-dashboard"
)

$ErrorActionPreference = "Stop"

if ([string]::IsNullOrWhiteSpace($IdentityFile)) {
    $IdentityFile = Join-Path $PSScriptRoot "..\.codex-deploy\kitchen-dashboard-vps-ed25519"
}

if ($SshTarget -notmatch "^[A-Za-z0-9._@:-]+$") {
    throw "SshTarget contains unsupported characters."
}
if ($ProjectDirectory -notmatch "^/[A-Za-z0-9._/-]+$") {
    throw "ProjectDirectory contains unsupported characters."
}

if (-not (Test-Path -LiteralPath $IdentityFile -PathType Leaf)) {
    throw "SSH identity file not found: $IdentityFile"
}

$localBranch = (git branch --show-current).Trim()
$localCommit = (git rev-parse HEAD).Trim()
$githubOutput = (git ls-remote --heads origin main).Trim()
if (-not $githubOutput) {
    throw "Could not read origin/main from GitHub."
}
$githubCommit = ($githubOutput -split "`t")[0]

$remoteScript = @'
set -eu
cd "$1"
printf '%s\n' "$(git branch --show-current)"
git rev-parse HEAD
'@
$remoteScript = $remoteScript -replace "`r`n", "`n"
$encodedRemoteScript = [Convert]::ToBase64String([System.Text.Encoding]::UTF8.GetBytes($remoteScript))

$remoteOutput = & ssh -i $IdentityFile -o BatchMode=yes -o ConnectTimeout=20 -o StrictHostKeyChecking=yes $SshTarget "echo $encodedRemoteScript | base64 -d | bash -s -- '$ProjectDirectory'"
if ($LASTEXITCODE -ne 0) {
    exit $LASTEXITCODE
}

$remoteLines = @($remoteOutput | Where-Object { $_.Trim() -ne "" })
if ($remoteLines.Count -ne 2) {
    throw "Unexpected VPS Git status response."
}
$vpsBranch = $remoteLines[0].Trim()
$vpsCommit = $remoteLines[1].Trim()

Write-Output "LOCAL:"
Write-Output "Branch: $localBranch"
Write-Output "Commit: $localCommit"
Write-Output ""
Write-Output "GITHUB:"
Write-Output "Branch: main"
Write-Output "Commit: $githubCommit"
Write-Output ""
Write-Output "VPS:"
Write-Output "Branch: $vpsBranch"
Write-Output "Commit: $vpsCommit"
Write-Output ""
Write-Output "STATUS:"
if ($localBranch -eq "main" -and $vpsBranch -eq "main" -and $localCommit -eq $githubCommit -and $githubCommit -eq $vpsCommit) {
    Write-Output "SYNCHRON"
} else {
    Write-Output "NOT SYNCHRON"
    exit 1
}
