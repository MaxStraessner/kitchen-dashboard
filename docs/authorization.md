# Authorization

## Household and membership model

A user account is separate from a household membership. The membership joins a user to a household and owns the role. The schema permits future multiple-household support, although this release exposes exactly one household and no switcher.

Roles are `admin` (**Administrator**) and `member` (**Mitglied**). Every protected backend endpoint resolves the session, active user, membership, and household. Frontend navigation is only a usability layer and is never the authority.

## Permission matrix

| Capability | Not signed in | Member | Administrator |
| --- | ---: | ---: | ---: |
| Public health and open setup status | Yes | Yes | Yes |
| Dashboard, weather, calendar | No | Yes | Yes |
| View/update own account | No | Yes | Yes |
| Change own password / revoke own other sessions | No | Yes | Yes |
| View user management | No | No | Yes |
| Create/edit users and roles | No | No | Yes |
| Activate/deactivate users | No | No | Yes |
| Reset another password / revoke sessions | No | No | Yes |

An account with `must_change_password=true` may only view its account, change its password, fetch the session CSRF value, or log out. Dashboard and provider APIs return `403` until the change succeeds.

## Last administrator protection

Before an active administrator is deactivated or changed to member, the backend counts active administrators in the household. If only one remains, it returns `409` with a domain-specific explanation. This also protects self-demotion and self-deactivation. No delete or membership-removal endpoint is exposed in this release.
