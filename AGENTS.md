# AGENTS.md — notes for whoever (human or agent) works here next

## Two codebases, one repository

* `src/` — the Vite + React 19 storefront. Build with `npx vite build`; the output lands in `dist/` and is
  copied over `platform/public/` (bundle under `front/`).
* `platform/` — the Laravel slice that ships *into* a `woodexinterior` checkout. It is not a runnable app on its
  own: `tools/furniture-commerce/apply.sh /path/to/woodexinterior` copies it across, patches the two OS-owned
  files it needs, and prints the install commands.

MCP tools read `src/lib/mcp/data.json` (regenerate with `bun --preload ./scripts/stub-assets.ts scripts/mcp-snapshot.ts`) — the MCP bundle cannot import frontend image assets.

## Agent skills

Installed from `laravel/agent-skills` and `truthanb/laravel-ai-skills` with `npx skills add …`:

| Path | What |
|---|---|
| `.agents/skills/<name>/SKILL.md` | the canonical copy of each skill (universal format) |
| `.claude/skills/<name>` | symlinks to the same files, for Claude Code |
| `.claude/agents/laravel-simplifier.md` | the official review agent, vendored by hand (the CLI installs skills, not agents) |
| `skills-lock.json` | source repository + content hash of every installed skill — how they are updated |

Refresh with `npx skills update -p`, add with `npx skills add https://github.com/laravel/agent-skills --yes`.

What is worth running here, and what is not:

* **`laravel-simplifier`** — yes, after a session's PHP changes. It reviews recently modified code for clarity
  without changing behaviour. It earned its place: it found `$kept` living inside `$form` on the Content screen,
  where a reset would have taken it with them.
* `starter-kit-upgrade`, `deploying-to-cloud`, `configure-nightwatch` — no. This is not a starter-kit project,
  the app is not on Laravel Cloud, and Nightwatch is not installed.
* `order-fulfillment`, `customer-support` (from `truthanb/laravel-ai-skills`) — kept as **format examples only**.
  Their rules ($50 free shipping) are not this shop's rules; the domain code is the source of truth.

## Skills are not policies

A skill is prose the agent reads; `app/Domain/**` is what the application does. When they disagree, the code
wins and the skill is wrong. The two demo skills are the worked example: they are installed, they are readable,
and nobody should follow their shipping threshold.
