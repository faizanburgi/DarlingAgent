# Campus Event Agent — WorkBuddy Expert Team

This is the native Expert Team artifact for Milestone 1. It contains an Event Coordinator and a Finance & Budgeting specialist only.

## Package contents

- `agents/` — coordinator and finance role instructions with explicit handoffs.
- `avatars/` — 512 × 512 PNG role images.
- `settings.json` — included because the current Expert Team structure documents it as required; its schema was not established by the retrieved documentation and must be validated in WorkBuddy.

No `.codebuddy-plugin/plugin.json` manifest is shipped in this directory. The official Expert documentation describes that manifest path, so confirm which package layout your installed WorkBuddy client expects before importing.

## Manual WorkBuddy validation

1. In WorkBuddy, open **Experts**, then **My Experts**, then choose **Create Expert Team**.
2. Import or submit this directory/its archive using the package flow offered by the installed client.
3. If parsing reports a `settings.json` schema error, use the client-generated team template as the authoritative schema and retain all other package files unchanged.
4. Summon the imported team and use the first quick prompt.
5. Confirm that the lead creates a team, delegates to Finance, calculates RM1,360, compares it to RM1,500, writes two actual draft artifacts, and labels all bookings/approvals as unverified.

No API route, marketplace publication path, or automatic import command is claimed by this package.
