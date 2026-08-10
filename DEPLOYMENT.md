# Kitchen Dashboard deployment

This is the operational source of truth for Kitchen Dashboard. It uses the existing isolated Docker Compose project; it never removes Docker volumes, databases, or unrelated VPS projects.

## Fixed production configuration

| Item | Value |
| --- | --- |
| GitHub repository | `https://github.com/MaxStraessner/kitchen-dashboard` |
| Production branch | `main` |
| VPS | Hostinger `srv1769417.hstgr.cloud` (`152.239.117.234`) |
| SSH target | `root@152.239.117.234` using the ignored local key `.codex-deploy/kitchen-dashboard-vps-ed25519` |
| VPS checkout | `/docker/kitchen-dashboard` |
| Compose file | `deploy/compose.prod.yaml` |
| Protected production environment | `/docker/kitchen-dashboard/.env` (mode `0600`, root-owned) |
| Compose project | `kitchen-dashboard` |
| Persistent database volume | `kitchen-dashboard_kitchen-dashboard-postgres-data` |
| Docker networks | `kitchen-dashboard_kitchen-dashboard-app`, `kitchen-dashboard_kitchen-dashboard-data` |
| Current internal HTTP endpoint | `http://127.0.0.1:18080` on the VPS |
| User-facing production URL | Not configured; no Kitchen Dashboard HTTPS proxy route exists yet |

The frontend, API, and PostgreSQL containers belong only to this Compose project. PostgreSQL is not published on a host port. The VPS also hosts independent `n8n`, `nuamkasse-ip`, and `telefonagent` projects; never restart, rebuild, or alter them while deploying Kitchen Dashboard.

## Security and routing status

The existing Traefik proxy is owned by the separate `n8n` project. No Kitchen Dashboard route was found in its configuration. Port `18080` is therefore only a direct HTTP service check, **not** a suitable user-facing production URL: production session cookies require HTTPS.

Do not enter credentials or complete setup through `http://<VPS-IP>:18080`. A future public HTTPS route must be added deliberately to the separate reverse-proxy configuration, with a matching `AUTH_ALLOWED_ORIGINS` value in the protected VPS environment. That routing change is outside the normal application deployment and must be reviewed separately.

Never commit or print `.env` values, private ICS URLs, Bring credentials, database credentials, or SSH private keys. Do not run `docker system prune`, `docker volume prune`, `docker volume rm`, or `docker compose down -v` for this project.

## Deploy main

From the repository root on Windows:

```powershell
.\scripts\deploy-production.ps1
```

The script first confirms the approved remote, an unchanged tracked worktree, the protected environment file, and an exact `origin/main` checkout. It refuses to deploy if VPS `main` is ahead of or diverges from GitHub `main`; it never resets that checkout.

When a new Git commit must be deployed, the script creates a timestamped PostgreSQL dump under the ignored VPS directory `/docker/kitchen-dashboard/backups/`, builds only the API and frontend images, and runs `docker compose up -d`. It does not run a database reset, `down`, pruning, or volume removal. An unchanged commit only runs the health verification.

It verifies the protected environment has mode `0600`, waits up to two minutes for all three containers to become healthy, then verifies `/healthz`, the proxied `/api/v1/health`, and the database component. On success it prints the exact deployed commit. A nonzero exit code means no successful deployment claim was made.

Use this non-mutating preflight when needed:

```powershell
.\scripts\deploy-production.ps1 -DryRun
```

## Check synchronization

```powershell
.\scripts\check-production.ps1
```

The command emits the required `LOCAL`, `GITHUB`, and `VPS` branch/commit fields. It prints `STATUS: SYNCHRON` only when all three are on `main` at the same commit; otherwise it exits with code `1` and prints `STATUS: NOT SYNCHRON`.

## Git workflow

Start a feature only from a clean checkout:

```powershell
.\scripts\start-feature.ps1 -Name <feature-name>
```

This fetches and fast-forwards `main`, then creates `feature/<feature-name>`. Develop and test only in that branch.

Before publishing a finished feature, inspect the scope and run the applicable backend and frontend quality commands from `README.md`. Then commit intentionally and push the branch:

```powershell
git status
git add <intended-files>
git commit -m "feat: <description>"
git push -u origin feature/<feature-name>
```

Open a pull request targeting `main`. After it has passed review and is merged, return locally to the new `main`, then deploy:

```powershell
git switch main
git pull --ff-only origin main
.\scripts\deploy-production.ps1
.\scripts\check-production.ps1
```

If `check-production.ps1` reports a mismatch, inspect the branch/commit history and reconcile it through the normal GitHub review flow. Do not use `git reset --hard` on the VPS as a shortcut.
