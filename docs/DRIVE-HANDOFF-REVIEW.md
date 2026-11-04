# Drive handoff review

The Drive folder contained two archives on 2026-11-03:

- `woodex furniture os .zip` (2,071,098 bytes): backend/admin handoff, imported unchanged to `legacy/woodex-os/` for review. It includes PHP APIs, admin and builder assets, a MySQL schema and a staging-only seed. See its README and `docs/FRONTEND-INTEGRATION.md` for its own setup instructions.
- `woodexfurniture.pk (1).zip` (150,458,517 bytes): exceeds the connected Drive download tool's 100 MiB limit. It has not been downloaded or inspected.

## Current state

The root application is a Vite/React frontend. The imported OS is a separate PHP/MySQL application, not yet wired into the frontend or served by Vite. This environment has no PHP or MySQL executable, so the imported backend, setup flow and database have not been run or security-tested. Do not deploy the legacy files directly without a security and deployment review; protect `_private` even on non-Apache hosting, configure the database outside version control, and do not use demo accounts in production.

The handoff describes same-origin endpoints including `/api/forms.php` and `/api/frontend-auth.php`. The current React contact and checkout pages simulate success; they do not submit to the imported backend. The cart and quotation basket use localStorage. Production integrations and real order handling require further implementation and verification. The supplied archive says it excludes production configuration and secrets; that claim has not been independently verified.

For a full comparison and migration, provide the website archive in parts smaller than 100 MiB or upload it to the workspace. Confirm whether to retain the React storefront and integrate this PHP backend or replace it with the archived site.
