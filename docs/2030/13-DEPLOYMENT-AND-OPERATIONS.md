# 13 — Deployment and Operations: Hostinger Shared Hosting

## 1. Target and constraint

Target production:
- Hostinger Shared Hosting.
- Laravel application.
- MySQL database.
- React storefront and dashboard as static builds.
- Cron-based scheduled tasks where supported.

The exact Hostinger plan tier and its capabilities have not been verified. Do not assume every Hostinger shared plan supports the same PHP, SSH, cron, resource or process limits.

## 2. Preflight checklist

Record actual values before selecting deployment topology:

| Capability | Required evidence |
|---|---|
| PHP version | Hostinger panel/runtime value |
| PHP extensions | Laravel-required extensions available |
| Composer | CLI access and version |
| SSH | Available and permitted |
| MySQL | Version, database/user limits, storage and connection limits |
| Cron | Minimum interval, execution timeout and command support |
| Storage | Disk/inode quotas and writable paths |
| Memory | PHP memory limit |
| Execution time | PHP max execution time |
| Upload | Upload and post size limits |
| SSL | HTTPS certificate and renewal |
| Document root | Ability to keep app source outside public web root |
| Backups | Schedule, retention and restore mechanism |
| Email | SMTP/provider credentials and delivery policy |

## 3. Deployment topology

Preferred conceptual layout:

```text
Hostinger account
  domains/
    storefront public root -> static React storefront build
    dashboard public root  -> static React dashboard build
    api public root        -> Laravel public/ directory
  private application area
    Laravel app source
    .env secrets
    logs
    private backups
  MySQL
    WOODEX production database
```

Actual directory structure depends on Hostinger account configuration. Never expose `.env`, source code, logs, backups or private uploads through the public document root.

If one domain is used, path routing and Laravel fallback rules must be tested so React routes do not collide with API routes.

## 4. Build and release

- Build React apps in a controlled CI/build environment.
- Upload only production build artifacts.
- Install Laravel dependencies with production flags in a compatible environment.
- Run configuration/cache commands only after environment setup.
- Use versioned releases or a rollback-capable deployment process where hosting permits.
- Never upload development `.env`.
- Set correct storage permissions.
- Run migrations only after backup and staging verification.
- Keep a release manifest with commit SHA and build date.

## 5. Queue and scheduler

Shared hosting may not support persistent workers.

Initial strategy:
- Laravel database queue if queue features are needed.
- Cron invokes scheduler at the supported interval.
- Use short, bounded jobs.
- Prevent overlapping scheduled jobs.
- Log job start, finish, failure and retry.
- Design idempotent jobs.
- Do not assume Redis, Horizon, Supervisor or daemon workers exist.

If cron cadence or execution time is insufficient for business needs, consider a supported external worker/service only after cost, security and owner approval.

## 6. Database operations

- Least-privilege MySQL application user.
- Separate staging and production databases.
- Automated backups with off-account copy where feasible.
- Regular restore test.
- Slow query review where supported.
- Migration backups before schema changes.
- No direct manual production edits without a recorded change procedure.

## 7. Media and uploads

- Validate file extension, MIME and content.
- Limit size and dimensions.
- Generate safe filenames.
- Store private documents outside public root or behind authorized controller.
- Use public media only for approved public assets.
- Avoid executable file types.
- Maintain asset metadata and usage references.
- Consider image compression and responsive derivatives.

## 8. Security operations

- HTTPS only.
- Secure cookies.
- Rotate credentials when staff access changes.
- Store secrets outside repository.
- Disable debug in production.
- Restrict admin routes.
- Rate-limit public forms and auth.
- Keep audit logs.
- Patch dependencies.
- Remove unused test routes and debug endpoints.

## 9. Monitoring

Track:
- HTTP error rates.
- Laravel exceptions.
- Failed queue jobs.
- Cron last-run status.
- Database connection failures.
- Disk/storage quota.
- Upload failures.
- Integration delivery failures.
- Backup success and restore evidence.

Provide an admin Platform Health page that shows status without exposing credentials or server internals.

## 10. Cutover checklist

- Staging deployment passes.
- MySQL schema and data migration reconciled.
- Login/session works across app surfaces.
- API CORS/CSRF and cookie scope verified.
- React assets load and routes resolve.
- Forms and media uploads work.
- Cron and queue strategy proven.
- Backup/restore tested.
- SEO routes and redirects tested.
- Owner signs off.
- Rollback build and data plan ready.
