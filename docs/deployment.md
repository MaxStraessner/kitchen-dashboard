# Future deployment outline

No deployment, VPS command, domain change, or reverse-proxy modification is performed by this project goal.

A later deployment to the existing Hostinger VPS should:

1. Inventory running applications, networks, port assignments, disk capacity, and backup policy.
2. Create a dedicated checkout, environment file, Docker project name, networks, and volumes for Kitchen Dashboard.
3. Set strong PostgreSQL credentials and private ICS values outside Git; back up the encrypted secret store.
4. Build the production Compose topology and run migration/health checks without exposing PostgreSQL.
5. Allocate an internal HTTP port that does not conflict with existing applications.
6. Add a dedicated subdomain in the existing reverse proxy, route it only to the frontend, and terminate HTTPS with a valid certificate.
7. Verify `/healthz`, `/api/v1/health`, weather, calendar stale behavior, and the kiosk viewport before changing the Raspberry Pi URL.
8. Configure regular volume/database backups with restore drills and retention.
9. Keep the previous image tags and database backup for rollback. Roll back application images first; only downgrade migrations after confirming backward-compatibility.
10. Monitor container health and logs without ever printing ICS URLs or environment values.

## Authentication requirements

Production login and the one-time setup must only be exposed through HTTPS. Do not enter any password or perform setup over an unencrypted test port such as `18080`. Set `APP_ENV=production`, `AUTH_COOKIE_SECURE=true`, and `AUTH_ALLOWED_ORIGINS` to the exact HTTPS application origin. The API refuses insecure production cookie settings and uses a `__Host-` session cookie without a Domain attribute.

Immediately after the application is reachable behind the protected HTTPS route, complete the one-time setup and create the first administrator. There are no default credentials. Treat an unexpectedly open setup screen on a database believed to contain users as a deployment fault and stop before entering credentials.

Isolation is mandatory: do not reuse another application’s database, volume, Compose project, or container names, and do not restart unrelated services. Automated server updates remain out of scope.
