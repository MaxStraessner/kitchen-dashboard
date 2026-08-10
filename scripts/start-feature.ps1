[CmdletBinding()]
param(
    [Parameter(Mandatory)]
    [ValidatePattern('^[a-z0-9]+(?:-[a-z0-9]+)*$')]
    [string]$Name
)

$ErrorActionPreference = "Stop"

if (git status --porcelain) {
    throw "Worktree is not clean. Commit or otherwise reconcile the current work before starting a feature branch."
}

git fetch origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git switch main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git pull --ff-only origin main
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }

git switch -c "feature/$Name"
if ($LASTEXITCODE -ne 0) { exit $LASTEXITCODE }
