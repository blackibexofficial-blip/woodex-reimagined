# Staging on Hostinger shared hosting

Everything needed to put Woodex OS on a Hostinger shared plan (no root, no supervisor) and keep it
there: first deploy, every deploy after that, rollback, and the cron entries the app expects.

Written for **one account**: `u128159657@72.60.93.138`, SSH port `65002`, your own domain pointed at
it. Change those in `deploy.conf` and nothing else needs to know.

---

## 1. What ends up where

Shared hosting serves one directory and nothing outside it. So the Laravel app lives outside the web
root and only `public/` is exposed — the standard shared-hosting layout, and the reason the deploy
script syncs two trees instead of one:

```
/home/u128159657/
├── woodex-app/                         ← the Laravel application (NOT web-reachable)
│   ├── app/  config/  database/  resources/  routes/  vendor/
│   ├── storage/                        ← logs, uploads, compiled views
│   └── public/                         ← source of truth for web files
├── woodex-releases/                    ← last 5 snapshots, for rollback
└── domains/<your-domain>/public_html/  ← the document root: a copy of woodex-app/public
```

`public/index.php` finds the app one level up, so nothing needs a rewrite rule or a root-owned
config change.

---

## 2. One-time setup (about 20 minutes, all in hPanel + DNS)

**a. Point the domain.** In hPanel add the domain as a website. Then at your DNS provider create:

| Type | Name | Value |
|---|---|---|
| `A` | `@` (or `staging`) | `72.60.93.138` |

Wait for propagation (`dig +short <domain>` returns that IP).

**b. PHP 8.4.** hPanel → Advanced → **PHP Configuration** → set **8.4** for this domain. The app
targets 8.4; 8.3 works but is not what it is written for. Do this *before* the first deploy: the
deploy script checks the CLI version and refuses to continue on anything older.

**c. Database.** hPanel → Databases → **MySQL Databases**:

1. Create a database, e.g. `u128159657_woodex`.
2. Create a user with a long password.
3. **Attach the user to the database** (the step everyone forgets — the deploy will fail with
   "Access denied" at migration time).

Note the three values: database name, user name, password. They go into `.env` in step 4.

**d. SSH key.** hPanel → Advanced → **SSH Access** → Add key → paste the **public** key:

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIJt+xhbI77wz2ol1L6271eeDaE5EyDpZ18WkvBWlVy7i woodex-staging-deploy@2026-11-05
```

Then, on your own machine:

```bash
cp deploy/hostinger/deploy.conf.example deploy/hostinger/deploy.conf
$EDITOR deploy/hostinger/deploy.conf      # SSH_HOST, SSH_USER, STAGING_DOMAIN, APP_DIR, REMOTE_*
ssh -p 65002 -i deploy/keys/woodex_staging_ed25519 u128159657@72.60.93.138 'echo connected'
```

**e. SSL.** hPanel → Security → **SSL** → install the free certificate once DNS resolves.

---

## 3. The application has to exist before it can be deployed

This repository is the **overlay slice** — the storefront, the block editor, the seeders. It is not a
whole Laravel app: no `artisan`, no `composer.json`, no `vendor/`. The app itself is your Woodex OS
checkout.

So, once, on your machine:

```bash
# 1. the OS checkout you already have from Drive
cd /path/to/woodexinterior

# 2. overlay this slice onto it
sh /path/to/woodex-reimagined/tools/furniture-commerce/apply.sh .

# 3. dependencies, once
composer install --no-dev --optimize-autoloader

# 4. point the deploy at it
$EDITOR /path/to/woodex-reimagined/deploy/hostinger/deploy.conf   # APP_DIR=/path/to/woodexinterior
```

`apply.sh` is idempotent. Run it again after every change in this repo; it copies files and
registers providers and routes, and reports what it did.

---

## 4. First deploy

```bash
cd /path/to/woodex-reimagined
./deploy/hostinger/deploy.sh --dry-run      # prints every step, touches nothing
./deploy/hostinger/deploy.sh --first-deploy
```

With `DB_NAME`, `DB_USER` and `DB_PASSWORD` filled in `deploy.conf`, that is the whole deploy: the
server writes a complete `.env` (URL, key, caching, mail, queue, database) and carries on to the
migrations in the same run. Nothing has to be edited on the server by hand.

Leave `DB_PASSWORD` empty and the script instead writes a `.env` template and **stops with exit code
3**, listing the file to edit. That is the fallback, not the normal path: it will not guess a
password, and it will not run migrations against a database it cannot reach.

```bash
ssh -p 65002 u128159657@72.60.93.138
nano ~/woodex-app/.env          # DB_DATABASE, DB_USERNAME, DB_PASSWORD
exit
./deploy/hostinger/deploy.sh --first-deploy
```

What the first deploy does, in order: builds assets → snapshots the previous release → syncs the app
→ syncs `public/` → creates the storage skeleton → generates `APP_KEY` → links `public/storage` →
migrates → seeds (settings, shell, home page — only because the database was empty) → caches → runs
`website:publish` → health-checks `https://<domain>/page-preview/home`.

If it reports **500**, read the log before anything else:

```bash
ssh -p 65002 u128159657@72.60.93.138 'tail -40 ~/woodex-app/storage/logs/laravel.log'
```

---

### When the application is already on the server

The common case after a first manual install: `public_html/` holds the OS checkout and the Laravel
root is `public_html/platform/`, with `vendor/` already installed. Do not rsync a whole app over it —
ship the slice and let the server apply it to what is there:

```bash
C=deploy/hostinger   # from the repository root

SSH_HOST=72.60.93.138 SSH_PORT=65002 SSH_USER=u128159657 \
SSH_KEY=deploy/keys/woodex_staging_ed25519 \
REMOTE_APP=/home/u128159657/public_html/platform \
REMOTE_SLICE=/home/u128159657/woodex-slice \
STAGING_DOMAIN=staging.blackibex.net \
DB_NAME=u128159657_woodexos DB_USER=u128159657_woodexos DB_PASSWORD='…' \
sh $C/sync-slice.sh
```

What it does: builds the SPA, rsyncs this repository to `~/woodex-slice` (outside the docroot, and
without `deploy/keys`), ships `dist/front/`, runs `apply.sh` **on the server** against the existing
app, then `remote.sh --migrate --seed-if-empty` with the credentials above.

Two notes that cost an hour otherwise:

* `REMOTE_SLICE` must be outside the domain root. The default puts it beside `REMOTE_APP`, which is
  inside `public_html` when the app is deployed that way — every file of this repository, including
  `deploy/`, would then be reachable over HTTP.
* If `public_html/.env` already exists (it did here, from an earlier install), the deploy now
  **updates** `DB_*`, `APP_URL`, `PUBLIC_SITE_URL` and `PUBLIC_LEADS_ALLOWED_ORIGINS` in place and
  leaves every other key alone. It used to skip the file entirely when it existed, so migrations ran
  against old credentials.

### Folder structure: where the app sits, and what the domain points at

Two rules decide everything else:

1. **Laravel's `public/` is the document root, or nothing is.** The domain must resolve into
   `…/platform/public`. If it resolves into `public_html` instead, the whole repository is served —
   `.git/`, `composer.json`, the source, and `.env`, which holds the database password.
2. **Nothing writable lives inside the document root.** `storage/`, `.env` and `vendor/` belong to the
   app, not to the web.

The install already on the server has the app in `public_html/platform/`, i.e. *inside* the document
root. That is not fatal, but it means the checkout is public, and whether that is currently harmless
depends entirely on one file: `public_html/.htaccess`.

Two ways to make it right, in order of preference:

**A. Retarget the document root (no files move).** hPanel → Websites → the domain → *Advanced* →
document root, set to `public_html/platform/public`. The app keeps working exactly as it is, and
`public_html/.env`, `.git/` and `composer.json` stop being reachable, because the domain no longer
serves that directory. Do this and the `public_html/.htaccess` question stops mattering.

**B. Leave the document root alone and front-controller it.** Point `public_html/index.php` at
`platform/public/index.php` (three `require`s and a `chdir`) and deny the sensitive paths in
`public_html/.htaccess`. This works, but every request now passes through a rewrite the framework did
not write, and it is one `.htaccess` merge away from serving a file it should not.

Either way, verify from outside — the checks are the point, not the configuration:

```bash
curl -s -o /dev/null -w '%{http_code}\n' https://staging.blackibex.net/.env          # must be 403/404
curl -s -o /dev/null -w '%{http_code}\n' https://staging.blackibex.net/.git/config   # must be 403/404
curl -s -o /dev/null -w '%{http_code}\n' https://staging.blackibex.net/composer.json # must be 403/404
curl -s -o /dev/null -w '%{http_code}\n' https://staging.blackibex.net/              # must be 200
```

### Checking (and repairing) the layout

`structure.sh` verifies the tree described above and repairs the two things that go wrong most often:
`storage`/`bootstrap/cache` permissions, and detritus left in the document root — a `recovery/` folder, a
diagnostic script, a zip someone downloaded there. It is read-only until you pass `--fix`.

```bash
sh structure.sh ~/public_html            # report
sh structure.sh ~/public_html --fix      # also chmod storage, 600 the .env, remove leftovers
```

It exits non-zero if anything is missing, so it can gate a deploy.

### Reading the server without downloading it

`inspect-remote.sh` prints the document root, the tree two levels down, which directory is the Laravel
root, whether `vendor/` and `.env` are present, PHP's version, and what `.htaccess` currently does. It
writes nothing. Run it in hPanel → Advanced → Terminal:

```bash
sh inspect-remote.sh ~/public_html
```

A Hostinger folder *download* is not a substitute: it is tens of megabytes of uploads, and the copy
that reaches Drive is regularly truncated — an export handed to us mid-project ended inside the third
file with no central directory, and could not be opened by any tool.

### The hPanel "Deploy from GitHub" button is not this deploy

hPanel → Advanced → GIT clones a branch into a directory and stops there. It does not run `npm` or
`composer`, it does not copy `dist/` anywhere, and it does not run `artisan` — so a checkout in
`public_html` is a folder of source, not a working site. That is fine as a *transport*; it is not a
deploy.

Two consequences worth deciding on before the first deploy:

* **Point it somewhere other than the document root.** A checkout in `public_html` puts the
  repository's `index.html` — a Vite entry that loads `/src/main.tsx`, not a built page — next to
  Laravel's `index.php`, and `/` may then be answered by a broken file. `woodex-source` beside it is
  the safer target.
* **Something still has to run the commands.** Options, in order of how little can go wrong: this
  script from your machine (needs `APP_DIR` locally); the workflow in
  `github-workflow-deploy-staging.yml.example`, which runs the same script in Actions; or a cron on
  the server running `remote.sh` after each pull, which is the only one that survives you not being
  at a keyboard.

## 5. Cron (two lines, both required)

hPanel → Advanced → **Cron Jobs**. Shared hosting has no supervisor, so the scheduler and the queue
worker are cron entries:

```cron
* * * * * cd /home/u128159657/woodex-app && /opt/alt/php84/usr/bin/php artisan schedule:run >> /dev/null 2>&1
* * * * * cd /home/u128159657/woodex-app && /opt/alt/php84/usr/bin/php artisan queue:work --stop-when-empty --tries=3 --max-time=50 >> /dev/null 2>&1
```

The second line is the shared-hosting answer to a queue daemon: it drains the queue and exits, so
there is never a process for the host to kill. `--max-time=50` keeps it inside the minute.

If `crontab` is not exposed in hPanel for your plan, the deploy still works; only scheduled jobs
(sitemap regeneration, abandoned-quote reminders) stop.

---

## 6. Deploys after that

**From GitHub**: Actions → *Deploy staging* → Run workflow.

Install the workflow once — it ships as a template because a token without `workflows` scope cannot
create files under `.github/workflows/`:

```bash
mkdir -p .github/workflows
cp deploy/hostinger/github-workflow-deploy-staging.yml.example .github/workflows/deploy-staging.yml
git add .github/workflows/deploy-staging.yml && git commit -m "ci: staging deploy" && git push
```

(The same file can be pasted directly into the GitHub web editor if your token cannot push it.) It builds the SPA, ships the slice, runs
`apply.sh` on the server, then migrates, caches and health-checks. Secrets it needs:

| Secret | Value |
|---|---|
| `HOSTINGER_SSH_KEY` | contents of `deploy/keys/woodex_staging_ed25519` (the private one) |
| `HOSTINGER_HOST` | `72.60.93.138` |
| `HOSTINGER_PORT` | `65002` |
| `HOSTINGER_USER` | `u128159657` |
| `STAGING_DOMAIN` | your domain |
| `REMOTE_APP` | `/home/u128159657/woodex-app` |
| `REMOTE_DOCROOT` | `/home/u128159657/domains/<domain>/public_html` |

**From your machine**: `./deploy/hostinger/deploy.sh` — the same steps, same script the workflow
calls, which is the point: when GitHub is down or the runner is unavailable, the deploy still runs.

---

## 7. Rollback

```bash
./deploy/hostinger/deploy.sh --rollback
```

Restores the newest snapshot from `~/woodex-releases` and clears caches. It does **not** reverse
migrations — if the release you are rolling back added any, run `php artisan migrate:rollback
--step=N` by hand and check the output. Five snapshots are kept; older ones are pruned.

---

## 8. Troubleshooting

| Symptom | Cause | Fix |
|---|---|---|
| `cannot ssh` | public key not added, or wrong port | hPanel → SSH Access; port is `65002`, not 22 |
| `Access denied` at migrate | DB user not attached to the database | hPanel → Databases → attach user |
| **500** on every page | `storage/` or `bootstrap/cache` not writable | `ssh … 'chmod -R ug+rwX ~/woodex-app/storage ~/woodex-app/bootstrap/cache'` |
| **500**, log says `No application encryption key` | `.env` has no `APP_KEY` | `php artisan key:generate --force` on the server |
| Unstyled admin | platform assets not built | `npm ci && npm run build` in `APP_DIR`, redeploy |
| Images broken | `public/storage` link missing | `php artisan storage:link` |
| Old page after deploy | opcache / cached views | `php artisan optimize:clear` (the deploy does this) |
| `404` on the health check | domain document root is not `public_html` | hPanel → Domains → document root |
| Deploy works, site shows another site | DNS not propagated | `dig +short <domain>` |

---

## 9. What staging deliberately does not have

- **No supervisor** — queues drain through cron (`queue:work --stop-when-empty`). Fine at staging
  volume; a production move to a VPS should switch to supervisor or Horizon.
- **No mail delivery** — `MAIL_MAILER=log` in the generated `.env`. Quotes and leads write to the
  log instead of sending, so a test never emails a real customer. Change it when you want real mail.
- **`APP_DEBUG=false` on purpose** — a staging site with debug on leaks `.env` contents on any error.
  The log file is the debugging tool.
- **Media is not fetched by the deploy** — the legacy product photos come from the old host via
  `tools/migration/fetch-legacy-media.php`, which needs outbound HTTP to `woodexfurniture.pk`. Run it
  on the server (or fetch locally and rsync `storage/app/public`). Until then pages render without
  those images.

### The staging package (for hosts with no shell)

Where hPanel has no Terminal, a slice deploy is impossible: `apply.sh`, `sync-slice.sh` and `structure.sh`
all need a shell. What works instead is one zip that needs nothing installed on the other side — no
composer, no node, no artisan on the command line.

`staging-package/` holds the three pieces that turn a copy of the application into that zip:

| File | Why |
|---|---|
| `root.htaccess` | sits above `platform/` and hands every request to `platform/public`, so the document root does not have to move |
| `setup.php` | goes in `platform/public/`; runs migrate, the five seeders, `storage:link` and the three caches over HTTP, gated on a key in the file |
| `READ-ME-FIRST.txt` | the three steps, in the order that works |

Build it from a working application (one that boots, with `vendor/` installed and `public/front` built):

```bash
# prune what production never loads — phpstan alone is 86 MB — then add the three pieces
rm -rf platform/vendor/phpstan
# composer's autoload_files.php still requires the pruned helpers; drop the entries whose files are gone
php -r '$p="platform/vendor/composer/autoload_files.php"; $f=require $p; $k=array_filter($f, fn($x)=>file_exists($x));
  $o="\<?php\n\$vendorDir=dirname(__DIR__);\nreturn array(\n";
  foreach($k as $i=>$x){$o.="    ".var_export($i,true)." => \$vendorDir . ".var_export(substr($x,strlen(__DIR__."/platform/vendor")),true).",\n";}
  file_put_contents($p, $o.");\n");'
cp deploy/hostinger/staging-package/root.htaccess  ./htaccess-tmp
cp deploy/hostinger/staging-package/setup.php      platform/public/setup.php
cp deploy/hostinger/staging-package/READ-ME-FIRST.txt .
zip -r -q -9 woodex-staging-master.zip . -x '*.DS_Store'
```

Two rules learned the hard way: **test the zip by booting it** (`php artisan --version`, then serve a
couple of routes) before uploading — pruning a `vendor/` package breaks `autoload_files.php` with a
fatal that only shows at boot, not at zip time — and **restore phpunit/mockery/pest/faker** if you prune
anything, because Laravel probes for PHPUnit at startup.
