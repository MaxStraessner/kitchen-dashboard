# Future modules

Recommended sequence after acceptance of accounts and household authorization:

1. Protected production rollout with HTTPS, backups, and rollback
2. Mobile family interface
3. Shared task persistence and workflows
4. Realtime synchronization as an optional transport
5. Display-device pairing and remote display state
6. Bring integration
7. Spotify integration
8. Calendar source management and authenticated providers
9. Smart-home read/control adapters
10. Camera views with explicit privacy controls
11. N8N automations

User accounts, the first household, memberships, roles, and permissions are now implemented. Public registration, email recovery, OAuth, passkeys, and two-factor authentication remain deliberately outside the current product scope.

N8N is an optional integration edge, not a core runtime dependency. Each new capability should preserve provider isolation, versioned contracts, household authorization, and graceful partial failure.
