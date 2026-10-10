# Campus Event Agent — Milestone 1 Prototype

This repository contains the first working prototype of the Campus Event Agent. It proves a narrow, WorkBuddy-led workflow: an Event Coordinator delegates an event budget to Finance & Budgeting, validates it deterministically, and produces draft event-plan and budget artifacts.

It does **not** claim to book venues, obtain university approval, send messages, spend funds, integrate Telegram, host a website, persist shared multi-channel state, or register itself in WorkBuddy automatically.

## Contents

- `skills/campus-event-agent/` — installable agent skill (event-planning guidance; does not install the MCP server).
- `packages/workbuddy-team/` — native WorkBuddy Expert Team package (Coordinator + Finance).
- `src/` — deterministic TypeScript support logic, separate from agent prompts.
- `examples/` — a repeatable demo request.
- `PROJECT_BRIEF.md.md` — product specification.

## Prerequisites

- Node.js 20 or newer.
- npm (or a compatible package manager) for local build/test execution.
- A WorkBuddy client/account with Expert Team creation or import access for native validation.

## Local deterministic demo

```bash
npm install
npm test
npm run demo
```

The demo writes two local **draft** artifacts into `artifacts/`:

- `event-plan.md`
- `budget.md`

The local runner is a reproducible deterministic reference implementation. It is not evidence that WorkBuddy has run. Native execution must be validated manually using [the WorkBuddy package README](packages/workbuddy-team/README.md).

## Install from GitHub and run as an MCP server (OpenCode)

No npm registry publishing is required. Install and launch the agent straight
from the public GitHub repository — replace `OWNER/REPOSITORY` and the tag
below with the real repository name and release tag once they are known:

```bash
npx -y github:OWNER/REPOSITORY#v0.1.0
```

Installing from GitHub clones the repository and runs the `prepare` script,
which compiles `src/` to `dist/` with the bundled TypeScript compiler, so the
`campus-event-agent` CLI is available without relying on any local build
state. Production dependencies (`@modelcontextprotocol/server`,
`better-sqlite3`, `zod`) are installed automatically; development-only
packages stay out of the runtime.

To install the CLI persistently instead of using `npx` each time:

```bash
npm install -g github:OWNER/REPOSITORY#v0.1.0
campus-event-agent
```

### Database location

The server stores its SQLite database **outside** the npm package directory,
so reinstalls, updates, and cache pruning never delete production data. Set
an explicit path with `CAMPUS_EVENT_DB_PATH`:

```bash
CAMPUS_EVENT_DB_PATH=/var/lib/campus-event-agent/campus-events.sqlite campus-event-agent
```

If `CAMPUS_EVENT_DB_PATH` is unset (or blank), the default per-user location
is used:

- Windows: `%LOCALAPPDATA%\campus-event-agent\campus-events.sqlite`
- macOS: `~/Library/Application Support/campus-event-agent/campus-events.sqlite`
- Linux/other: `$XDG_DATA_HOME/campus-event-agent/campus-events.sqlite`,
  falling back to `~/.local/share/campus-event-agent/campus-events.sqlite`

Relative `CAMPUS_EVENT_DB_PATH` values resolve against the current working
directory. The parent directory is created automatically on startup.

### OpenCode configuration

Add a local MCP server entry to `opencode.json` / `opencode.jsonc`:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "campus-event-agent": {
      "type": "local",
      "command": ["npx", "-y", "github:OWNER/REPOSITORY#v0.1.0"],
      "environment": {
        "CAMPUS_EVENT_DB_PATH": "/var/lib/campus-event-agent/campus-events.sqlite"
      },
      "enabled": true
    }
  }
}
```

Use an absolute database path so the location does not depend on OpenCode's
working directory. Alternatively, install the package globally once and use
`"command": ["campus-event-agent"]` with the same `environment` block.

On Windows, set the variable persistently before launching OpenCode, or put
it in the `environment` block with escaped backslashes:

```powershell
setx CAMPUS_EVENT_DB_PATH "$env:LOCALAPPDATA\campus-event-agent\campus-events.sqlite"
```

```jsonc
"environment": {
  "CAMPUS_EVENT_DB_PATH": "C:\\Users\\you\\AppData\\Local\\campus-event-agent\\campus-events.sqlite"
}
```

Single backslashes are invalid JSON — always double them. Server logs go to
stderr; stdout is reserved for MCP protocol traffic.

## Install the skill with Skills CLI

The skill teaches a compatible AI agent how to plan and coordinate campus
events. It is distributed from the public GitHub repository through the
[`skills` CLI](https://github.com/vercel-labs/skills) — replace
`OWNER/REPOSITORY` with the real repository name once it is known. These
commands were verified against the official CLI reference; only the
repository placeholder is still unknown:

```bash
npx skills add OWNER/REPOSITORY --list
```

```bash
npx skills add OWNER/REPOSITORY --skill campus-event-agent -a opencode -a codex -a claude-code -a cursor -a windsurf
```

```bash
npx skills add OWNER/REPOSITORY --skill campus-event-agent -g -a opencode -a codex -a claude-code -a cursor -a windsurf
```

Notes:

- `--list` (short form `-l`) lists the repository's skills without installing.
- `--skill` (short form `-s`) selects the `campus-event-agent` skill by the
  `name` in its `SKILL.md` frontmatter. The skill lives at
  `skills/campus-event-agent/SKILL.md`, which is one of the CLI's standard
  discovery locations.
- `-a` / `--agent` targets specific agents. The identifiers `opencode`,
  `codex`, `claude-code`, `cursor`, and `windsurf` are all supported by the
  CLI. Without `-a`, the CLI auto-detects installed agents or prompts.
- `-g` / `--global` installs to your user directory instead of the project.
- Add `-y` / `--yes` for non-interactive installation.
- Installing the skill does **not** install or configure the MCP server.
  Follow "Register the MCP server in compatible clients" below for the tools.

## Register the MCP server in compatible clients

Prerequisites: Node.js 20 or newer, and an explicit database location via
`CAMPUS_EVENT_DB_PATH` (see "Database location" above). The server runs as a
local stdio process; logs go to stderr and MCP traffic stays on stdout.

The simplest repeatable setup is the GitHub invocation (replace
`OWNER/REPOSITORY` and the tag once known):

```text
command: npx -y github:OWNER/REPOSITORY#v0.1.0
env: CAMPUS_EVENT_DB_PATH=<absolute-path-to>/campus-events.sqlite
```

Per-client wiring:

- **OpenCode** — see "OpenCode configuration" above.
- **Claude Code** — `claude mcp add --env CAMPUS_EVENT_DB_PATH=<absolute-path> --transport stdio campus-event-agent -- npx -y github:OWNER/REPOSITORY#v0.1.0`
- **Codex** — `codex mcp add campus-event-agent --env CAMPUS_EVENT_DB_PATH=<absolute-path> -- npx -y github:OWNER/REPOSITORY#v0.1.0`, or add an `[mcp_servers.campus-event-agent]` table with `command`, `args`, and `env` to `config.toml`.
- **Cursor** — add to `.cursor/mcp.json` (project) or `~/.cursor/mcp.json` (global):
  ```json
  {
    "mcpServers": {
      "campus-event-agent": {
        "command": "npx",
        "args": ["-y", "github:OWNER/REPOSITORY#v0.1.0"],
        "env": { "CAMPUS_EVENT_DB_PATH": "<absolute-path>/campus-events.sqlite" }
      }
    }
  }
  ```
- **Windsurf** — same `mcpServers` entry in `~/.codeium/windsurf/mcp_config.json` (macOS/Linux) or `%USERPROFILE%\.codeium\windsurf\mcp_config.json` (Windows), then restart Windsurf.

Alternatively, install the package globally once (`npm install -g github:OWNER/REPOSITORY#v0.1.0`) and use `campus-event-agent` as the command with the same environment block.

## Registration forms and Tally

The skill plans registration requirements and drafts form questions (field
schema plus tracker template). The MCP server is the source of truth for
executable capabilities: it has no live-form tool, and there is no Tally
integration in this milestone — so agents must report a form
**specification**, never a live form link, unless an authorised tool outside
this package actually created one and returned evidence.

## Local MCP server (development checkout)

The local stdio MCP adapter exposes the persistent application service; it does not run an autonomous agent or perform external actions. Set an explicit database path, then start it:

```bash
CAMPUS_EVENT_DB_PATH=./data/campus-events.sqlite npm run mcp
```

On Windows PowerShell: `$env:CAMPUS_EVENT_DB_PATH = '.\\data\\campus-events.sqlite'; npm run mcp`.

Configure a compatible MCP client to launch `node`, with arguments `dist/scripts/run-mcp.js`, and the `CAMPUS_EVENT_DB_PATH` environment variable. The available tools are `event_create`, `event_get`, `event_update_facts`, `task_create`, `task_submit_result`, `task_transition`, `budget_validate`, `event_list_tasks`, `approval_request`, `approval_record_decision`, and `artifact_get`. Logs go to stderr; stdout is reserved for MCP protocol traffic.

## Tests

The automated suite covers:

- budget total calculation;
- over-budget detection;
- missing attendee/budget inputs;
- validation failure while preserving draft artifacts.

## WorkBuddy compatibility and verification

The team manifest uses the fields documented for Expert Teams: `plugin.json`, a lead, member list, agent definitions, role avatars, and an Education category. The exact import UI and `settings.json` schema depend on the installed WorkBuddy environment and need validation. See [packages/workbuddy-team/README.md](packages/workbuddy-team/README.md).

Do not add credentials to this repository. The prototype has no external credentials or API calls.

## Next scope, deliberately deferred

Five remaining specialists, shared persistence, Telegram, web UI, npm registry publishing, external connectors, bookings, live forms, and production authentication are deferred until the native WorkBuddy execution path is proven. Direct GitHub installation (`npx -y github:OWNER/REPOSITORY#v0.1.0`) is supported; only the npm registry release is deferred.
