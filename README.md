# Campus Event Agent

Campus Event Agent is a specialised event-planning and coordination agent for university clubs, societies, departments, and event organisers. It combines conversational event planning with persistent event and task records, structured tool execution, deterministic budget validation, human approval workflows, and real registration-form creation through the Tally API.

Unlike a general-purpose chatbot, it keeps operational state in SQLite across sessions, enforces task dependencies and approval gates before consequential actions, validates budget arithmetic deterministically rather than by assertion, and returns actual form URLs only after verifying them against the live Tally API.

## What it does

- Turns a natural-language event request into a persistent event record with extracted attendance, budget ceiling, and currency.
- Plans specialist work across six workstreams (compliance and safety, registration, logistics, marketing and communications, finance and budgeting, work distribution) as structured tasks with explicit dependencies and statuses.
- Validates budgets deterministically: line-item arithmetic is recalculated and compared against the ceiling, and the result is persisted as a validation snapshot.
- Gates consequential actions behind explicit human approvals with revision-checked decisions.
- Drafts registration forms as reviewable specifications, then creates live Tally forms only after explicit user confirmation, verifying each form before reporting it as live.
- Reports honestly: completed work, drafts, assumptions, missing information, conflicting facts, and checks that could not be verified.

## Current capabilities and limitations

**Working today (implemented and covered by the 46-test automated suite):**

- Persistent events, tasks with dependencies, sourced facts with conflict preservation, specialist results, budget validations, approvals with decisions, and artifact metadata — all in SQLite with revision checks.
- All 15 MCP tools listed below, including registration drafting, confirmation-gated live Tally form creation, and a read-only Tally connectivity diagnostic.
- A live Tally connectivity check returning a successful connection has been demonstrated against the real API, and one real registration form has been created, verified, persisted, and retrieved end to end.

**Limitations to take seriously:**

- The coordinator role is guidance plus tools, not an autonomous agent: the six specialist areas are responsibility checklists, and only two native WorkBuddy roles exist (coordinator and finance). There is no parallel multi-agent orchestration in the code.
- The live Tally demonstration covers connectivity plus one published form. That does not make the workflow production-ready, and every published URL must still be opened and checked individually.
- The agent cannot book venues, obtain institutional approval, send messages, spend funds, or grant permissions. Anything in these categories is preparation and tracking only, disclosed as such.

## Architecture: skill, MCP server, native roles, and sub-agents

These are four different things. Do not confuse them:

- **MCP server** (`src/adapters/mcp/server.ts`, launched as `campus-event-agent`): the executable capability layer. A local stdio process exposing 15 tools over the Model Context Protocol. This is what does the work.
- **Skill** (`skills/campus-event-agent/SKILL.md`): installable planning guidance for a compatible AI agent. It teaches the coordinator workflow and documents the MCP tools. Installing the skill does **not** install or configure the MCP server. There are no independently executing sub-agents behind the skill — the specialist sections are checklists the coordinator works through.
- **Native WorkBuddy Expert Team roles** (`packages/workbuddy-team/agents/`): two role definitions that exist today — the Event Coordinator lead and the Finance & Budgeting specialist — for import into WorkBuddy. They are prompts and handoff contracts, not running software.
- **Sub-agents**: none are implemented. Do not describe the six workstreams as six running agents.

Supporting layers: a framework-independent core (`src/core/`) with no database, network, or SDK dependencies; a SQLite adapter (`src/adapters/sqlite/`); a Tally REST adapter (`src/adapters/tally/`); startup scripts (`src/scripts/`); and the test suite (`src/tests/`).

## Prerequisites

- Node.js 20 or newer (`engines` requires `>=20`).
- npm for install, build, and test. (On Windows, if bare `npm` resolves to `C:\Windows\System32\npm` instead of Node's npm, invoke `C:\Program Files\nodejs\npm.cmd` explicitly.)
- A Tally account and API key — only required for live form creation and the connectivity diagnostic. Everything else works without it.
- A WorkBuddy client/account with Expert Team import access — only required for the native team package in `packages/workbuddy-team/`.

## Quick start — OpenCode first

The tested installation path is OpenCode launching the package straight from GitHub. No npm registry release exists, so install from the repository at `https://github.com/zeethdaleel/Workbuddy-Event-Coordinator`, tracking the `main` branch:

```bash
npx --allow-git=all -y github:zeethdaleel/Workbuddy-Event-Coordinator#main
```

The `--allow-git=all` flag matters: some npm versions refuse Git dependencies outright (`EALLOWGIT`). Passing the flag to the single `npx` invocation unblocks this install without changing your global npm security configuration — do not lower npm's defaults to accommodate it.

This clones the repository, runs the `prepare` script (TypeScript compile via the bundled compiler), installs production dependencies (`@modelcontextprotocol/server`, `better-sqlite3`, `zod`), and exposes the `campus-event-agent` command. For a persistent install instead of per-launch `npx`:

```bash
npm install -g github:zeethdaleel/Workbuddy-Event-Coordinator#main
campus-event-agent
```

## Complete OpenCode configuration

Add a local MCP server entry to your global `opencode.json` / `opencode.jsonc` (e.g. `~/.config/opencode/opencode.jsonc`). This exact shape is the tested setup:

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "mcp": {
    "campus-event-agent": {
      "type": "local",
      "command": [
        "npx",
        "--allow-git=all",
        "-y",
        "github:zeethdaleel/Workbuddy-Event-Coordinator#main"
      ],
      "environment": {
        "CAMPUS_EVENT_DB_PATH": "C:/Users/you/AppData/Local/campus-event-agent/events.sqlite",
        "TALLY_API_KEY": "{file:~/.campus-tally-key}"
      },
      "timeout": 120000
    }
  }
}
```

Notes:

- `command` is an array: executable followed by arguments. Keep `--allow-git=all` so the GitHub install is not blocked.
- `environment` sets variables on the spawned server process only. `CAMPUS_EVENT_DB_PATH` selects the database (see next section). `TALLY_API_KEY` enables live Tally features; the `{file:…}` form reads the key from a file at startup so the secret never sits in the config. Replace the example database path with your own absolute path.
- `timeout` is the MCP startup timeout in milliseconds. `120000` is appropriate here because first launch may compile and install before responding.
- Windows paths in JSON need either forward slashes (as above — accepted) or correctly escaped backslashes (`C:\\Users\\you\\…`). Single backslashes are invalid JSON and produce parsing errors.
- When pasting configuration from chat, copy raw JSON without Markdown code fences — fences pasted into the file are a common source of JSON parsing errors.

## Database configuration and persistence

`CAMPUS_EVENT_DB_PATH` selects the SQLite database, resolved at startup by `src/scripts/db-path.ts`:

- If set to an absolute path, that path is used as-is.
- If set to a relative path, it resolves against the server process's working directory — which is why an **explicit absolute path is recommended** in MCP configuration.
- If unset or blank, a per-user default outside the npm package/install/cache directories is used, so reinstalls and cache pruning never delete production data:
  - Windows: `%LOCALAPPDATA%\campus-event-agent\campus-events.sqlite`
  - macOS: `~/Library/Application Support/campus-event-agent/campus-events.sqlite`
  - Linux/other: `$XDG_DATA_HOME/campus-event-agent/campus-events.sqlite`, falling back to `~/.local/share/campus-event-agent/campus-events.sqlite`

The parent directory is created automatically. **Different database paths are fully separate application states**: an event created under one path is invisible under another. The most common cause of a "missing event" (`not_found`) is the client pointing at a different database file than the one holding the event — check `CAMPUS_EVENT_DB_PATH` first. All server logs go to stderr; stdout is reserved for MCP protocol traffic.

## Tally setup and registration workflow

The server integrates with the [Tally API](https://developers.tally.so/) (`POST /forms` to create, `GET /forms/{formId}` to verify, Bearer-token authentication, 100 requests/minute limit). Supply `TALLY_API_KEY` at runtime only — environment variable or the client's documented file-substitution mechanism. Never commit it, never pass it as a tool argument, never paste it into prompts: the implementation sends it solely as an `Authorization` header and never returns it in tool results, logs, or errors.

Without a key, drafting and retrieval keep working while creation reports `tally_not_configured`. With a key, follow the workflow in order:

1. **Create or retrieve an event** (`event_create`, `event_get`).
2. **Prepare a registration draft** (`registration_draft` with optional `capacity`, `deadline`, and `includeStudentId` / `includeDietary` / `includeAccessibility` / `includeConsent` flags). The draft is a reviewable specification plus any missing requirements (unknown capacity or deadline). Drafting is offline and never creates a live form.
3. **Review and confirm the specification** with the user. The default fields are full name (required), email (required), and phone (optional); sensitive fields stay optional and the server refuses to make them mandatory.
4. **Create the form only after explicit confirmation**: `registration_create` with a `registrationId` and `confirmed: true` (the flag defaults to `false`, and an unconfirmed call returns the draft instead of creating anything). Creation refuses duplicates — one live form per event (`duplicate_id`) — then verifies the returned form (matching ID, `PUBLISHED` status, not closed) before persisting only metadata: external form ID, URL, status, spec hash, timestamps. No keys, submissions, or personal data are stored.
5. **Retrieve stored metadata** any time with `registration_get`.
6. **Verify the published URL separately** by opening it. A successful creation proves the API accepted and returned the form; it does not prove the public page renders — check each URL individually.

To check readiness before promising anything, run `tally_verify_connection`: one authenticated `GET /forms` whose listing body is discarded. It returns `{ connected: true }`, `tally_not_configured`, `tally_auth`, or another connection error — and nothing else. A success proves the key is accepted; it says nothing about any particular form.

## Available MCP tools

Verified against `src/adapters/mcp/server.ts` (IDs: 1–128 characters, start with a letter or digit, letters/numbers/`.`, `_`, `-` only):

- Event: `event_create` (brief → persistent draft workflow), `event_get` (workflow plus full summary), `event_update_facts` (sourced estimates or confirmed facts; contradictions are preserved as conflicting, never overwritten).
- Tasks: `task_create` (bounded task with optional same-event dependencies), `task_submit_result` (structured specialist result with evidence and unresolved issues), `task_transition` (lifecycle, dependency, approval, and revision checks), `event_list_tasks` (statuses, dependencies, submitted results).
- Budget: `budget_validate` (deterministic validation snapshot of the event's itemised budget against its ceiling).
- Approvals: `approval_request` (records a pending request; executes nothing), `approval_record_decision` (`approved` / `rejected` / `expired`, revision-checked).
- Artifacts: `artifact_get` (draft artifact metadata; file contents never exposed).
- Registration: `registration_draft`, `registration_create`, `registration_get` (see workflow above).
- Diagnostics: `tally_verify_connection` (read-only connectivity probe; see above).

Failures use explicit reasons (`not_found`, `duplicate_id`, `revision_conflict`, `invalid_transition`, `approval_required`, `dependency_unmet`, `file_not_written`, `conflicting_fact`, `confirmation_required`, `tally_not_configured`, `tally_auth`, `tally_rate_limited`, `tally_timeout`, `tally_unavailable`, `tally_malformed`, `tally_unverified`) instead of silent retries.

## Skills and WorkBuddy Expert Team setup

- **Skill** (`skills/campus-event-agent/`, name `campus-event-agent`): installable planning guidance for compatible agents. List and install from the real repository with the Skills CLI:
  ```bash
  npx skills add zeethdaleel/Workbuddy-Event-Coordinator --list
  npx skills add zeethdaleel/Workbuddy-Event-Coordinator --skill campus-event-agent -a opencode -a codex -a claude-code -a cursor -a windsurf
  ```
  Add `-g` for a global (user-directory) install, `-y` to skip prompts. Installing the skill does not install or configure the MCP server — set up the server separately as above.
- **WorkBuddy team** (`packages/workbuddy-team/`): native role definitions (Event Coordinator lead, Finance & Budgeting specialist), avatars, and import notes in its own README. Validate the import flow in your WorkBuddy client; the package claims no automatic registration.
- **Other MCP clients** (compatibility guidance, OpenCode remains the tested path): use the same GitHub invocation with each client's stdio-server format —
  - Claude Code: `claude mcp add --env CAMPUS_EVENT_DB_PATH=<absolute-path> --transport stdio campus-event-agent -- npx --allow-git=all -y github:zeethdaleel/Workbuddy-Event-Coordinator#main`
  - Codex: `codex mcp add campus-event-agent --env CAMPUS_EVENT_DB_PATH=<absolute-path> -- npx --allow-git=all -y github:zeethdaleel/Workbuddy-Event-Coordinator#main`
  - Cursor (`.cursor/mcp.json`) / Windsurf (`mcp_config.json`): an `mcpServers` entry with `command: npx`, matching `args`, and an `env` block. Add `TALLY_API_KEY` to the same `env` block where live forms are needed.

## Development, build, tests, and local demo

```bash
npm install
npm run build   # tsc -p tsconfig.json
npm test        # build, then node --test dist/tests/**/*.test.js
npm run demo    # deterministic prototype: writes artifacts/event-plan.md and artifacts/budget.md
npm run mcp     # build, then start the stdio server (uses CAMPUS_EVENT_DB_PATH)
```

The suite (46 tests) covers the event/task/approval lifecycle, persistence contracts and revision conflicts, the registration workflow with mocked Tally responses (success, auth, rate-limit, timeout, malformed), key-leakage checks, the connectivity diagnostic, skill packaging, and CLI startup configuration. The demo request in `examples/networking-event-request.md` ("Organise a university networking event for 50 attendees within RM1,500…") produces a draft RM1,360 budget with passing checks while leaving venue, approvals, and quotations explicitly unverified. Broader product background lives in `PROJECT_BRIEF.md.md`. Product specification lives in `PROJECT_BRIEF.md.md`.

## Troubleshooting

- **npm refuses the GitHub install (`EALLOWGIT`).** Use `npx --allow-git=all -y github:zeethdaleel/Workbuddy-Event-Coordinator#main` for that invocation. Do not change global npm security settings.
- **OpenCode reports the MCP server unavailable or times out at startup.** Confirm the `command` array runs by hand, raise the entry's `timeout` (e.g. `120000`) since first launch compiles and installs, and check the client's MCP output for the server's stderr lines (`[campus-event-mcp] …`), which state the database path and whether Tally is enabled.
- **JSON parsing errors in configuration.** Strip Markdown fences before pasting, and use forward slashes or doubled backslashes in Windows paths.
- **`tally_not_configured`.** `TALLY_API_KEY` is absent from the launching environment. Add it to the entry's `environment` (or a `{file:…}` reference) and restart the server process.
- **Tally authentication failures (`tally_auth`).** The key is missing, revoked, or pasted with extra whitespace. Re-copy it from the Tally dashboard into the secret store (never into chat or the repo) and retry once — repeated 401s count against the rate limit.
- **Event missing (`not_found`) right after creating it.** You are almost certainly looking at a different database file: compare `CAMPUS_EVENT_DB_PATH` across the creating and reading configurations. Separate paths mean separate state.
- **Behavior does not match the latest `main`.** `npx` caches the downloaded package, so a stale cache can pin an old build (symptom: the tool list lacks `tally_verify_connection`). Refresh the cached install for this package before deeper debugging; only clear cache entries you can re-download, since the next launch refetches them.
- **Connectivity check passes but a form URL misbehaves.** These are different claims: the diagnostic proves key acceptance, not that a specific page renders. Open each published URL individually.

## Security considerations

- `TALLY_API_KEY` is runtime-only configuration. It travels solely as an `Authorization` header and never appears in tool results, logs, errors, artifacts, or the database.
- Tally documents no scoped keys: each key inherits its user's permissions, so one central Tally account owns every form created through it — including visibility into all submissions, quota consumption, and retention. Plan account access and handover deliberately.
- Registration collects the minimum by default; sensitive fields are optional unless the organiser justifies them, and only form metadata (never submissions or personal data) is persisted.
- Do not commit credentials, event attendee data, or private sample data. `.env` files are git-ignored; `.env.example` documents variable names only.

## Roadmap and known limitations

Planned, not implemented: executable specialist sub-agents beyond the two native WorkBuddy roles, parallel orchestration, Telegram and web interfaces, npm registry publishing, external connectors beyond Tally, venue bookings, production authentication, and interactive selection UI in clients (today's MCP surface is text-in/text-out; richer picking controls are a UX aspiration, not a feature).

Known limitations: the deterministic prototype budget is illustrative rather than quoted; multi-channel shared state is not implemented; the WorkBuddy import flow depends on the installed client's UI and needs manual validation. Live Tally use is demonstrated but not production-hardened — keep confirming each published form by opening it.
