# Campus Event Agent — Milestone 1 Prototype

This repository contains the first working prototype of the Campus Event Agent. It proves a narrow, WorkBuddy-led workflow: an Event Coordinator delegates an event budget to Finance & Budgeting, validates it deterministically, and produces draft event-plan and budget artifacts.

It does **not** claim to book venues, obtain university approval, send messages, spend funds, integrate Telegram, host a website, persist shared multi-channel state, or register itself in WorkBuddy automatically.

## Contents

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

## Local MCP server

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

Five remaining specialists, shared persistence, Telegram, web UI, npm publishing, external connectors, bookings, live forms, and production authentication are deferred until the native WorkBuddy execution path is proven.
