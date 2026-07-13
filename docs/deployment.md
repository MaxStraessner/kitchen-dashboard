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

Isolation is mandatory: do not reuse another application’s database, volume, Compose project, or container names, and do not restart unrelated services. Automated server updates remain out of scope.

