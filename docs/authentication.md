# Authentication

## Passwords

Passwords are 12–128 Unicode characters, allow spaces, and are never truncated. `pwdlib[argon2]` stores only Argon2id hashes. Login uses a dummy hash when a username is unknown so the visible error remains identical. Passwords and hashes are excluded from schemas, audit metadata, and logs.

## One-time setup

`GET /api/v1/setup/status` reports whether any user exists. While empty, `POST /api/v1/setup/initialize` creates the household, first user, admin membership, session, and audit event in one transaction. A PostgreSQL advisory transaction lock serializes attempts; a unique setup guard is a second database-level concurrency barrier. Any failure rolls the transaction back. Once a user exists, every later initialization returns `409`.

There is no setup code, standard account, or standard password.

## Sessions and cookies

The server creates independent random session and CSRF values with at least 256 bits of entropy. PostgreSQL stores only SHA-256 token hashes, never the bearer values. Sessions become invalid when expired, revoked, when the user is inactive, or when no household membership exists.

Normal sessions last at most 24 hours and remembered sessions at most 30 days by default. Password changes revoke all old sessions and issue a fresh current session. Logout revokes the current session; logout-all and administration can revoke more.

Development uses the HttpOnly `kitchen_session` cookie with `SameSite=Lax` and `Path=/`. Production uses `__Host-kitchen_session` with `Secure`, `HttpOnly`, `SameSite=Lax`, `Path=/`, and no Domain attribute. Production startup rejects `AUTH_COOKIE_SECURE=false`. Authentication data is never placed in URLs, Local Storage, Session Storage, frontend logs, or API bodies.

## CSRF and origins

Each session has a bound CSRF value. The readable, non-authenticating CSRF cookie lets `GET /api/v1/auth/csrf` return that value only for the matching authenticated session. The frontend sends it as `X-CSRF-Token` for POST, PUT, PATCH, and DELETE operations. The backend compares its hash with the session row and rejects an Origin header not present in `AUTH_ALLOWED_ORIGINS`. The session bearer cookie remains HttpOnly.

Login and the still-open initialization endpoint do not require an existing-session CSRF value. Their impact is limited by generic authentication handling, same-site cookies, the one-time transaction, and login rate limiting.

## Login limiting

Failed attempts are persisted using the normalized username, client origin, and timestamp. After the configured maximum within the configured window, login returns `429`; the German visible message remains exactly the same as every other login failure. There is no permanent account lock. Old attempts naturally fall outside the rolling window.

## Password change and reset

Users provide their current password and a distinct new password. Success clears `must_change_password`, revokes other sessions, replaces the current session, and writes an audit event. Administrators can set only a new temporary password for another user; they can never read an existing password. A reset sets `must_change_password=true` and revokes all sessions.

## Audit events

Audit events cover setup, successful and failed login, logout, account creation and changes, activation/deactivation, role changes, password changes/resets, and session revocation. Metadata must never contain passwords, hashes, tokens, cookies, database credentials, or calendar URLs.

## Development and production

Local HTTP is allowed only with `APP_ENV=development` and `AUTH_COOKIE_SECURE=false`. Production requires HTTPS and secure cookies. HSTS is emitted only for secure production configuration; CSP, anti-sniffing, referrer, frame, and permissions policies are emitted generally.
