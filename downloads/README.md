# Downloads

Large, ready-to-use bundles. These are **build outputs**, not source — they live here only because
Hostinger's file manager needs a clickable download and the account has no way to run a build.

| File | What it is |
|---|---|
| `woodex-staging-master.zip` (70 MB) | The whole application, installable with File Manager only: `vendor/` installed, CSS/JS compiled, SPA build and uploaded media included, plus `setup.php` to run migrations over HTTP |

Install steps are in the release notes and in `deploy/hostinger/staging-package/READ-ME-FIRST.txt`:

1. Delete the old contents of the staging folder.
2. Upload, then extract, so `.htaccess` and `platform/` sit directly in that folder.
3. Open `https://staging.blackibex.net/setup.php?key=woodex-setup-9f3a2b` and check every step says PASS.
4. Delete `setup.php`.

**Download:** `https://github.com/blackibexofficial-blip/woodex-reimagined/raw/arena/0378ff53-woodex-reimagined/downloads/woodex-staging-master.zip`

Once the account has SSH or the deploy workflow is in place, delete this folder: it is 70 MB of
history that a `git clone` should not have to carry.
