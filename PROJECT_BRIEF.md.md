# Campus Event Agent — Project Detail Report

**Document type:** Product brief and implementation context for a coding agent  
**Working product name:** Campus Event Agent  
**Competition:** DORMATHON 2026 — Track 2: Agentic Solution  
**Status:** Concept and scope defined; technical feasibility and integration access still need validation  
**Primary execution platform:** Tencent WorkBuddy, subject to the hackathon's tool-use rules and available account permissions

---

## 1. Executive Summary

Campus Event Agent is an AI-powered event-planning and coordination system for university clubs, student societies, departments, and event organisers. A user describes an event in natural language. The system understands the goal and constraints, creates an execution plan, delegates work to specialist agents, coordinates dependencies, validates outputs, and delivers a complete event pack.

The product must be accessible through **three coexisting interfaces**:

1. **Telegram bot** — the user sends a message to start or manage an event.
2. **Tencent WorkBuddy chat** — the user interacts directly with the event coordinator inside WorkBuddy.
3. **Web application** — a dedicated event-management website with a chat interface and a place to review event progress and deliverables.

These are not three separate products or three separate agent implementations. They are three entry points to the **same event-management workflow and shared event state**. A task started in one channel should, where the implementation and permissions allow, be visible and resumable from another channel.

The coordinator is supported by six specialist roles:

1. Compliance & Safety
2. Registration
3. Logistics
4. Marketing & Communications
5. Finance & Budgeting
6. Work Distribution

The product is intended to demonstrate genuine agentic execution, not just text generation. It should decompose a goal, use available tools to create useful outputs, validate those outputs, adapt to problems, and report honestly what is complete, pending, blocked, or awaiting human approval.

The intended long-term distribution model is open source: maintain the code in a public GitHub repository and provide an npm-based developer installation path. Users should be able to clone the repository or install a published package, configure the required WorkBuddy connection, and use the event-management agent. A separate WorkBuddy-compatible package/import path must also be provided because npm installation alone does not automatically register a native WorkBuddy Expert Team.

**Core product promise:** One prompt → one goal → coordinated execution → verified, usable event deliverables.
**Distribution promise:** Public source code + repeatable installation + documented WorkBuddy integration.

---

## 2. Hackathon Context and Constraints

Track 2 asks teams to use WorkBuddy and AI agents to solve real-world problems by understanding goals, planning workflows, using tools, and delivering end-to-end outcomes.

The supplied brief identifies the following capabilities:

- Understanding the goal
- Planning tasks
- Executing actions
- Collaborating and validating
- Integrating results
- Delivering the final outcome

The brief says strong solutions should address a real problem with a well-defined user, demonstrate agentic workflows, use WorkBuddy meaningfully as the primary execution platform, achieve end-to-end execution with minimal intermediate user guidance, and deliver reliable and verifiable results.

Examples of agentic behaviour listed in the brief include autonomous task decomposition, multi-step execution, tool calling, agent collaboration, parallel workflows, validation and quality control, and dynamic adaptation based on outcomes.

### Mandatory design implication

WorkBuddy must be the primary execution platform for the agentic workflow. The implementation must not reduce WorkBuddy to a decorative chat window while an unrelated model or orchestration system does all the substantive work.

### Tool-use policy warning

The event information shared by the team says Track 2 has an exclusive WorkBuddy tool requirement covering the project, slides, and documentation. The team should confirm with organisers what this means for coding tools. This document is intended as context for Codex, but **using Codex to implement or produce competition deliverables may conflict with the stated Track 2 rules**. Do not assume it is permitted. Confirm before using Codex for competition work; otherwise, use this specification within the approved WorkBuddy workflow.

### Platform capabilities that must be verified

Do not assume that the current WorkBuddy account supports every capability the product wants. Validate, early:

- Access to the relevant WorkBuddy agent/Expert Team features.
- Whether specialist agents can be invoked programmatically or only through a native interface.
- Availability and terms of the WorkBuddy Open Platform/API for third-party applications.
- Whether a custom Telegram bot can invoke the same coordinator and specialist workflow.
- Whether WorkBuddy can create files, execute scripts, access approved connectors, and return artifact links.
- Authentication, rate limits, and permissions for any external integrations.

The Telegram feature available in a particular WorkBuddy release may be a remote-control integration rather than a direct route to a custom agent team. Test this rather than assuming both are equivalent.

---

## 3. Problem Statement

University events require coordination across several workstreams. Organisers often manage compliance documents, safety requirements, venue permissions, registration, catering, marketing, budgets, task assignments, and deadlines in separate tools and conversations.

This leads to:

- Repeated manual work and duplicated information.
- Inconsistent dates, attendance limits, and budgets across documents.
- Missed approval requirements and incomplete safety paperwork.
- Confusion about task ownership and deadlines.
- Promotional materials being prepared before key event details are confirmed.
- A plan that looks complete but has unresolved operational gaps.

Campus Event Agent should reduce this coordination burden by creating one coherent plan, executing routine preparation work where tools permit, validating consistency, and clearly identifying items that still need human decisions or institutional approval.

---

## 4. Target Users

### Primary users

- University student societies and clubs.
- Student council and postgraduate student representatives.
- University departments and event committees.
- Student event organisers who may have limited event-management experience.

### Secondary users

- Staff advisers and event approvers.
- Volunteers and team members assigned tasks.
- Finance, venue, catering, or safety contacts involved in event preparation.

### User needs

Users should be able to describe an event in ordinary language without knowing the full list of planning steps. They need the system to find gaps, create a realistic plan, generate practical deliverables, track the work, and distinguish confirmed facts from assumptions.

---

## 5. Product Goals

### Primary goals

1. Turn an event request into a structured event record and execution plan.
2. Coordinate six specialist workstreams through one Event Coordinator.
3. Use WorkBuddy and its available tools to perform real work.
4. Generate a consistent event pack with useful files and trackers.
5. Detect missing information, conflicting requirements, invalid totals, and unresolved dependencies.
6. Keep event state and deliverables associated with one event across the Telegram, WorkBuddy, and website interfaces.
7. Provide progress updates and an honest completion report.
8. Require human approval for consequential actions unless the user has explicitly authorised them and the relevant policy permits them.
9. Maintain a public GitHub repository with setup instructions, configuration examples, tests, licensing, and contribution guidance.
10. Provide an npm-based installation path for developers, including a documented way to configure the package for WorkBuddy.
11. Provide a WorkBuddy-compatible Expert/Expert Team bundle and/or connector package using documented platform formats; keep these artifacts versioned with the source.

### Non-goals for the initial version

- Replacing the university's official event approval system.
- Automatically granting institutional, venue, or EHS approval.
- Making purchases, paying invoices, or committing funds without explicit authorisation.
- Guaranteeing venue availability without a verified source or confirmed response.
- Sending mass communications without review/approval.
- Building a full event ticketing or payment platform.
- Creating unlimited agents with no defined responsibilities or controls.
- Using a separate, independent AI orchestration engine as the primary runtime without confirming that this complies with Track 2.
- Claiming that `npm install` alone automatically installs or registers a native WorkBuddy Expert Team unless that behaviour has been verified against an officially supported mechanism.

---

## 6. Product Interfaces: All Three Must Coexist

### 6.1 Telegram bot

**Purpose:** Fast, mobile-first access. Users can create an event, answer clarifying questions, check progress, and receive links to deliverables through Telegram.

**Expected user experience:**

1. User messages the bot with an event request.
2. The bot identifies the user and creates or resumes an event session.
3. The coordinator confirms its understanding and asks for critical missing details only.
4. The system launches the workflow and sends progress updates when meaningful milestones are reached.
5. The bot returns a summary and links to the event pack when ready.
6. The user can send follow-up instructions that update the existing event rather than accidentally starting a duplicate event.

**Implementation constraints:**

- Use Telegram Bot API through an approved integration.
- Keep tokens in environment variables or an approved secret store; never commit them.
- Validate incoming webhook requests if webhooks are used.
- Associate Telegram user/chat identifiers with application users/events safely.
- Handle duplicate updates, retries, timeouts, and long-running tasks.
- Do not assume native WorkBuddy Telegram remote control can invoke the custom Event Coordinator; verify the routing capability.

### 6.2 Native Tencent WorkBuddy chat

**Purpose:** Direct use within WorkBuddy, where WorkBuddy is the primary agent execution platform.

**Expected user experience:**

1. User gives the event request in WorkBuddy.
2. The coordinator understands the goal and creates a plan.
3. The coordinator invokes appropriate specialist roles and tools supported by the account.
4. The specialists generate outputs and report structured results.
5. The coordinator validates and integrates those outputs.
6. The user receives the final event pack and an honest status report.

**Implementation constraints:**

- Prefer native, documented WorkBuddy capabilities where possible.
- Verify actual feature names, API endpoints, permissions, and account access before implementing against them.
- Do not fabricate WorkBuddy APIs or assume its agent orchestration behaves like another platform.
- Keep the event workflow and deliverable schema consistent with the other two channels.

### 6.3 Dedicated web application

**Purpose:** A focused event-management website with a chatbot and an interface for tracking event status, tasks, approvals, and generated outputs.

**Minimum user experience:**

- A chat area for describing the event and sending updates.
- An event workspace/list so users can return to existing events.
- A progress view showing plan stages and task status.
- A deliverables area with links to generated files.
- A section for assumptions, blockers, approval requests, and unresolved decisions.
- Clear status labels: queued, running, needs input, awaiting approval, blocked, completed, failed.

**Implementation constraints:**

- Use WorkBuddy as the primary execution engine through a documented and authorised route.
- Do not implement a parallel general-purpose agent as a shortcut unless the organisers approve this and it still satisfies the WorkBuddy requirement.
- Do not expose API keys or WorkBuddy credentials in browser code.
- Add authentication and event-level access controls if users' event records are persisted online.
- Treat generated content and uploaded documents as potentially sensitive.

### 6.4 Public GitHub repository, npm package, and WorkBuddy installation

**This is a product requirement, not an optional afterthought.** The project should be open source and designed for other developers to install and run, not only for the hackathon team's own account.

#### Intended user experience

A developer should be able to:

1. Visit the public GitHub repository and inspect the source, license, security policy, roadmap, and documentation.
2. Either clone the repository and run `npm install`, or install the published package from the npm registry using the final documented package name.
3. Run a guided setup/diagnostic command to check Node.js requirements, create local configuration from an example, and explain required WorkBuddy setup.
4. Install or import the WorkBuddy-compatible agent/team bundle or connector using the documented supported WorkBuddy flow.
5. Configure only the credentials and integrations they choose to use.
6. Run a small health check or sample event and receive clear diagnostics if a prerequisite is missing.

The final package name and exact commands are undecided. Use placeholders in documentation until the package scope and repository name are confirmed. Do not publish a placeholder package or claim an installation path works until tested end to end.

#### Important distinction: GitHub, npm, and WorkBuddy serve different purposes

- **GitHub** hosts the source repository, issues, releases, documentation, and contribution history. Cloning a repository is done with `git clone`; `npm install` installs dependencies after cloning.
- **npm** distributes versioned JavaScript packages. The npm package may provide the CLI/installer and, where appropriate, the local MCP server or runtime tools.
- **WorkBuddy native agent/team distribution** must follow a WorkBuddy-supported format and import/publishing process. WorkBuddy's official Expert documentation describes a package structure with `.codebuddy-plugin/plugin.json`, `agents/` definitions, and optional skills; Expert Team packages can include a team lead and specialist agent definitions. The official Open Platform supports creation and publication flows subject to account eligibility, review, and platform requirements.
- **WorkBuddy connector distribution** is a separate mechanism for exposing tools. The official Connector documentation describes MCP + Skill and CLI + Skill integration. For an appropriate local stdio MCP connector, WorkBuddy documents `npx`-based startup with a Node runtime; a CLI connector can declare a Node runtime and install the CLI through its supported configuration.

These formats are related but not interchangeable. A WorkBuddy Expert Team bundle is not the same thing as an npm package, and a connector that exposes tools is not automatically the complete multi-agent team. Choose and document the supported route for each deliverable.

Official references to verify during implementation:

- WorkBuddy Expert: https://open.workbuddy.cn/en/docs/expert
- WorkBuddy Expert Team: https://open.workbuddy.cn/en/docs/expert-team
- WorkBuddy Connector: https://open.workbuddy.cn/en/docs/connector
- WorkBuddy Open Platform overview: https://open.workbuddy.cn/en/docs/what-is-open-platform

#### Recommended distribution design

Maintain one versioned source repository with distinct release artifacts:

1. **Native WorkBuddy team bundle** — coordinator/team-lead definition, six specialist definitions, skills, metadata, required assets, and a build/export script that creates the expected WorkBuddy-compatible package. Keep the bundle compatible with the currently documented schema and test that it imports successfully.
2. **npm CLI/installer package** — offers commands such as `setup`, `doctor`, `validate`, and `package` (final command names may change). It should check prerequisites, write a local configuration file from a template, validate the WorkBuddy bundle, and explain the native WorkBuddy import/connect steps. It must not silently write into undocumented WorkBuddy directories or claim success if manual import is required.
3. **Optional MCP/connector package** — only if the product needs custom executable tools that WorkBuddy does not already provide. It should expose narrowly scoped operations with clear schemas, authentication, timeouts, readable errors, and permission checks. WorkBuddy should remain the primary execution platform for the agentic workflow.
4. **Public web/Telegram deployments** — these may need a hosted backend and separate deployment instructions. Do not require every self-hosting developer to use the maintainers' hosted service or share its credentials.

The team should decide whether the npm package is a local CLI, an MCP server, a bundle installer, or a small combination of these. Prefer the smallest package that solves a verified installation need. Do not build an elaborate installer before the native WorkBuddy team package is validated.

#### Suggested repository layout

Adapt this layout to the actual stack after auditing the repository; do not restructure a working repository blindly.

```text
campus-event-agent/
├── apps/
│   └── web/                         # Dedicated web application
├── packages/
│   ├── cli/                         # npm CLI: setup, diagnostics, packaging
│   ├── workbuddy-team/              # Native WorkBuddy team definitions and assets
│   │   ├── .codebuddy-plugin/
│   │   │   └── plugin.json
│   │   ├── agents/
│   │   ├── skills/
│   │   └── avatars/
│   └── mcp-server/                  # Optional, only if an MCP service is needed
├── integrations/
│   └── telegram/                    # Telegram adapter or deployment configuration
├── docs/
│   ├── installation.md
│   ├── workbuddy-setup.md
│   ├── telegram-setup.md
│   ├── self-hosting.md
│   ├── security.md
│   └── troubleshooting.md
├── examples/
├── tests/
├── .env.example                     # Placeholder names only; no secrets
├── LICENSE
├── SECURITY.md
├── CONTRIBUTING.md
├── README.md
└── package.json                     # Workspace/root package if appropriate
```

#### Open-source release requirements

- Choose an OSI-approved license after the team decides its licensing goals; do not invent a license header or omit the license file.
- Pin or constrain dependencies responsibly and commit the package lockfile when appropriate.
- Use semantic versioning for published releases and document breaking changes.
- Add automated tests and a continuous-integration workflow for linting, type checks, tests, and package/build validation.
- Include an `.env.example` containing placeholder variable names only.
- Never commit Telegram bot tokens, WorkBuddy credentials, OAuth refresh tokens, event attendee data, university documents, or private sample data.
- Provide clear data-handling and retention notes, especially for registration lists and safety documents.
- Add a security reporting path and dependency update process.
- Make installation steps reproducible on the platforms actually supported by the package. State those platforms explicitly.
- Include a sample/demo mode so developers can test the workflow without real credentials or external side effects; label all mock results clearly.
- Document which features require a local WorkBuddy desktop session, a WorkBuddy account, Open Platform approval, external API credentials, or hosted infrastructure.
- Never claim that the Telegram bot, hosted web app, or WorkBuddy marketplace listing is available until that path has actually been deployed and tested.

#### Installation acceptance criteria

The open-source distribution is not complete until a fresh developer environment can:

1. Follow the README without relying on undocumented maintainer knowledge.
2. Clone the public repository and install dependencies successfully, or install the published npm package by its release name.
3. Run the CLI diagnostic/setup command and see actionable messages for missing prerequisites.
4. Generate or obtain a valid WorkBuddy-compatible agent/team package.
5. Follow the official WorkBuddy flow to import, connect, or install the package, with manual steps clearly documented where required.
6. Run a sample request and distinguish simulated results from real tool execution.
7. Configure credentials locally without exposing them to source control or the browser.
8. Upgrade or uninstall the package using documented steps.

A public repository alone is not the full goal. The goal is **public source + repeatable developer setup + a verified WorkBuddy installation path**.

---

## 7. Core Architecture

The intended architecture has three interface adapters, one shared event state, one orchestrator, and six specialist roles.

```text
Telegram Adapter ---------+
                           |
WorkBuddy Native Entry ----+----> Event Coordinator / Orchestration
                           |                 |
Web Chat Adapter ----------+                 |
                                             v
                                  Shared Event State / Task Plan
                                             |
                +----------------------------+----------------------------+
                |             |              |             |              |
           Compliance   Registration     Logistics     Marketing       Finance
                |             |              |             |              |
                +-------------+--------------+-------------+--------------+
                                             |
                                      Work Distribution
                                             |
                                             v
                               Validation and Integration
                                             |
                                             v
                                Final Event Pack / Status
```

This is a logical architecture, not a claim that every component is already provided by WorkBuddy. Map it to the actual APIs and capabilities available in the approved environment.

### Architecture principles

1. **One source of truth:** event facts and approved decisions should live in shared, persistent state rather than being repeated independently across chats.
2. **One coordinator:** one role owns the master plan and final integration.
3. **Bounded specialist roles:** each specialist has a clear responsibility, input contract, output contract, and completion criteria.
4. **Tool-mediated execution:** agents should use documented tools to create or modify deliverables rather than falsely claiming work was done.
5. **Explicit dependencies:** parallelise independent tasks; wait for prerequisites when tasks depend on confirmed facts.
6. **Traceability:** store the source, assumption, or decision behind material facts where feasible.
7. **Idempotency:** retries should not create duplicate events, forms, messages, or files unnecessarily.
8. **Human control:** consequential external actions need approval gates.
9. **Failure visibility:** clearly record what failed, what was retried, and what remains incomplete.
10. **Channel parity:** all three interfaces should invoke the same event workflow, not separate implementations with divergent behaviour.

---

## 8. Event Coordinator: Responsibilities and Workflow

The Event Coordinator is the lead agent and owner of the end-to-end outcome.

### Responsibilities

- Interpret the user's event goal.
- Extract known information and constraints.
- Identify missing critical inputs and ask focused questions.
- Separate facts from assumptions.
- Create a master event plan with tasks and dependencies.
- Select the specialist roles required for that event.
- Launch independent tasks in parallel only when appropriate and supported.
- Monitor specialist status and collect results.
- Resolve or surface conflicts between workstreams.
- Request corrections when checks fail.
- Maintain consistent event facts across all deliverables.
- Obtain approval before restricted actions.
- Produce the final pack and completion report.

### Suggested event lifecycle

1. **RECEIVED** — incoming request recorded.
2. **UNDERSTANDING** — goals, audience, date, venue constraints, attendance, budget, and outputs extracted.
3. **NEEDS_INPUT** — one or more critical details need user clarification.
4. **PLANNING** — master task plan and dependencies created.
5. **EXECUTING** — specialists work on assigned tasks.
6. **VALIDATING** — outputs and cross-workstream consistency checks run.
7. **NEEDS_APPROVAL** — a human decision or authorisation is required.
8. **INTEGRATING** — approved and validated outputs are assembled.
9. **COMPLETED** — requested deliverables exist and completion checks pass.
10. **BLOCKED / FAILED** — progress cannot safely continue or repeated attempts failed; explain the cause and recovery path.

Status can return to an earlier stage if the user changes a key constraint (for example, venue capacity or event date).

### Clarification policy

Ask a question when missing information materially affects safety, feasibility, cost, permissions, or an irreversible action. Otherwise, proceed with a clearly labelled assumption and make it easy for the user to correct. Avoid asking the user to decide every minor detail.

---

## 9. Specialist Agent Specifications

Each specialist should have a written role prompt or configuration, a bounded scope, structured inputs and outputs, and objective completion checks. The specialists should return results to the coordinator, not independently declare the overall event complete.

### 9.1 Compliance & Safety Agent

**Purpose:** Identify and prepare the compliance and safety documentation relevant to the event, especially university events.

**Responsibilities:**

- Identify applicable institutional requirements from the actual policies, forms, or approved knowledge sources available to the system.
- Prepare a checklist of required approvals and supporting documents.
- Draft EHS, safety, and risk-assessment materials using the available official templates.
- Track form/approval status, owner, deadline, and supporting information.
- Flag missing policy sources, incomplete fields, high-risk activities, and unanswered safety questions.
- Distinguish draft documents from submitted, reviewed, or approved documents.

**Inputs:** Event type, date/time, venue, attendee count, activities, equipment, catering details, institution, official policy sources and form templates.

**Outputs:** Compliance checklist, draft documents where supported, risk register, missing-information list, approval tracker, and sources used.

**Acceptance checks:** No invented institutional requirement; no claim of approval without evidence; unresolved safety issues are visible; draft and approved statuses are distinct.

**Safety boundary:** The agent can prepare and check documentation. It cannot certify safety, grant permission, or represent a draft as official approval.

### 9.2 Registration Agent

**Purpose:** Design the attendee-registration workflow and create registration assets.

**Responsibilities:**

- Design registration questions based on event requirements.
- Identify required versus optional fields and provide a suitable attendee notice where needed.
- Respect capacity limits and registration deadlines.
- Generate a live form through a supported integration, or produce a form specification if live creation is unavailable.
- Prepare a registration tracker and confirmation-message copy.
- Create check-in/attendance materials and post-event attendance summary structure.
- Avoid collecting unnecessary personal data.

**Inputs:** Event details, audience, capacity, registration deadline, accessibility/dietary needs where relevant, required attendee information, privacy requirements, approved tool options.

**Outputs:** Form or form specification, field schema, confirmation text, registration tracker, check-in list template, and unresolved setup actions.

**Acceptance checks:** Questions match the event; capacity/deadline are consistent; sensitive fields are not collected without a justified need; the agent truthfully identifies whether a live form was created.

### 9.3 Logistics Agent

**Purpose:** Coordinate physical and operational requirements.

**Responsibilities:**

- Identify venue requirements and compare available options where source data is available.
- Track venue capacity, availability, accessibility, setup needs, restrictions, and estimated costs.
- Prepare booking requests, while requiring approval before sending or confirming if required.
- Estimate catering quantities from expected attendance and dietary information.
- Plan equipment, furniture, signage, transport, and layout requirements.
- Create an event-day running order and logistics checklist.
- Coordinate with Compliance on venue permissions and safety constraints.
- Coordinate with Finance on cost and budget feasibility.

**Inputs:** Date/time, expected attendance, event format, location, budget, accessibility needs, venue data, menu/quotation data, and applicable policies.

**Outputs:** Venue comparison, booking-request draft, catering plan, equipment and setup checklist, event-day schedule, and logistics risks.

**Acceptance checks:** Availability is not fabricated; estimated costs are labelled; capacity fits expected attendance; dependencies and unresolved bookings are visible.

### 9.4 Marketing & Communications Agent

**Purpose:** Prepare a coherent, accurate event-promotion package.

**Responsibilities:**

- Define audience, key message, channels, and promotion timeline.
- Draft event descriptions, invitations, emails, social captions, and poster briefs.
- Use confirmed event details only; mark placeholders for unconfirmed venue/time/speaker details.
- Coordinate dates, registration links, capacity, and naming with the shared event record.
- Propose accessibility-conscious, clear communications.
- Prepare reminders and post-event thank-you messages where requested.

**Inputs:** Confirmed event facts, audience, brand/organisation guidelines, approved poster assets, promotional channels, registration link/status, and publication dates.

**Outputs:** Campaign plan, message variants, poster/design brief, invitation draft, publishing schedule, and outstanding information list.

**Acceptance checks:** No contradictory date, venue, price, or registration URL; unconfirmed facts are placeholders; outbound mass communications require approval.

### 9.5 Finance & Budgeting Agent

**Purpose:** Develop and validate the event budget.

**Responsibilities:**

- Build an itemised cost estimate from supplied figures or verified quotations.
- Separate confirmed costs, estimates, and unknown costs.
- Calculate subtotals, total estimated spend, budget remaining, and contingency.
- Compare venue/catering options where data exists.
- Identify budget overruns and alternative scenarios.
- Maintain a consistent approved budget version.
- Prepare expense tracker and post-event reconciliation template if needed.

**Inputs:** Budget limit, attendee count, venue/catering quotations, equipment costs, sponsorship/income information, currency, and contingency policy.

**Outputs:** Itemised budget, calculation summary, comparison table, assumptions, remaining budget, contingency, and flagged overrun risks.

**Acceptance checks:** Totals are recalculated programmatically or checked with a reliable tool where possible; units/currency are clear; estimates are not presented as confirmed quotations; the total respects the budget or a clear exception is raised.

### 9.6 Work Distribution Agent

**Purpose:** Turn the plan into an owned and trackable execution schedule.

**Responsibilities:**

- Convert coordinator tasks into actionable items.
- Assign a human owner or team/role where the user has provided one.
- Propose owners only as suggestions when no owner is specified.
- Define deadlines, dependencies, status, and priority.
- Identify overdue, blocked, duplicated, or unowned tasks.
- Prepare a task tracker and progress summary.
- Generate reminders or follow-up drafts when requested and supported.

**Inputs:** Master task plan, event date, available team members/roles, deadline constraints, dependencies, and current task status.

**Outputs:** Task register, owner suggestions, timeline, dependency map, overdue/blocked task report, and reminder drafts.

**Acceptance checks:** Tasks have clear descriptions and statuses; dependencies are explicit; no person is treated as having accepted an assignment unless confirmed; reminders are not sent without applicable authorisation.

---

## 10. Shared Data Model

The implementation should establish a consistent event record before adding multiple interfaces. The exact database and schema should be selected after examining the repository and approved implementation environment.

At minimum, store the following logical entities:

### Event

- `event_id`
- `created_by` / owning user or organisation
- `title` and `event_type`
- `purpose` and target audience
- `date`, `start_time`, `end_time`, and timezone where known
- `location` and venue status
- `expected_attendance` and capacity limit
- `budget_amount` and currency
- event status
- known facts and assumptions
- unresolved questions and risks
- created/updated timestamps

### Task

- `task_id`, `event_id`
- title, description, specialist owner, and optional human owner
- status and priority
- dependencies
- input references and output references
- validation status and failure details
- timestamps and retry count

### Deliverable / Artifact

- `artifact_id`, `event_id`, optional `task_id`
- artifact type and title
- file/storage location or supported external link
- version
- status: draft, needs_review, approved, final, failed
- source/assumptions
- created timestamp

### Approval

- `approval_id`, `event_id`, related task or artifact
- action requiring approval
- requested-by and approver identity where applicable
- status: pending, approved, rejected, expired
- decision timestamp and notes

### Event Decision / Fact

Store significant approved choices and facts that specialists must use consistently, such as the event date, approved venue, confirmed attendance limit, approved budget, and registration deadline. Keep a record of the source or person that confirmed each important fact.

### Conversation / Channel Link

Store channel type and the IDs needed to map an authorised Telegram or web user to an event. Keep secrets out of this record. Do not expose private event information to users who are not authorised to access it.

This is a conceptual model. Do not implement every field if it is unnecessary for the first demonstrable MVP, but preserve the ability to associate events, tasks, approvals, and artifacts reliably.

---

## 11. Task Contracts and Agent Collaboration

The coordinator should assign every specialist a task with:

- Objective
- Relevant event facts and constraints
- Expected output format
- Required tools or source material
- Dependencies
- Completion criteria
- Restrictions and approval boundaries

Each specialist should return a structured result containing:

- `status`: completed, needs_input, blocked, failed, or needs_approval
- `summary`
- `deliverables`: artifact references/links and their status
- `facts_used` and `assumptions`
- `risks` or `conflicts`
- `validation_checks` and results
- `next_actions`

Use the format supported by the chosen agent platform; the field names above describe the logical contract, not an assumed WorkBuddy-native schema.

### Parallelisation rules

Tasks may run in parallel when they do not depend on unconfirmed information. For example:

- Marketing can draft generic campaign options while Logistics investigates venues.
- Compliance can identify required documents while Finance structures the budget.
- Final marketing copy should wait for confirmed date, venue, price, and registration URL.
- Registration should use the agreed capacity and deadline.
- Final integration must wait for all required outputs or explicitly mark missing outputs.

### Conflict handling

If specialist outputs disagree, the coordinator must not silently choose an unsupported answer. It should:

1. Identify the conflict and its source.
2. Determine whether a confirmed source or approved fact resolves it.
3. Ask the user if a material decision remains unresolved.
4. Update the shared event record.
5. Regenerate dependent outputs as required.
6. Record the resolution in the final report.

---

## 12. End-to-End User Journey

### Example request

> Organise a networking event for 50 postgraduate students next month with a maximum budget of RM1,500. Prepare the event plan, registration materials, promotion pack, and task tracker.

### Expected execution

1. Coordinator extracts 50 attendees, RM1,500 maximum budget, event type, and requested outputs.
2. It asks for essential missing details such as institution/campus or an acceptable date range if these materially affect venue, safety, or permission requirements.
3. It creates the event record and master task plan.
4. Compliance identifies the applicable official requirements based on supplied institutional sources.
5. Finance creates a budget with estimates and clearly marked unknowns.
6. Logistics investigates or structures venue/catering options using available information.
7. Registration designs the form and tracker using the current capacity and deadline.
8. Marketing drafts materials using confirmed information and placeholders for unconfirmed details.
9. Work Distribution creates owners/deadlines or clearly marks them as unassigned.
10. Coordinator checks cost totals, date consistency, capacity, required deliverables, policy evidence, and cross-document consistency.
11. If checks fail, the relevant specialist is asked to correct its output or the coordinator asks the user for a decision.
12. The system presents the event pack, progress summary, outstanding actions, approval requests, assumptions, and links to the actual generated artifacts.

The system must not claim that a venue is booked, a form is live, a permission is granted, or an email is sent unless there is evidence that the action succeeded.

---

## 13. Deliverables and File Generation

The target event pack may include:

1. **Master event plan** — objectives, scope, event details, milestones, risks, dependencies, and status.
2. **Budget spreadsheet** — itemised estimates, confirmed quotations, totals, remaining balance, contingency, and assumptions.
3. **Compliance pack** — requirement checklist, drafts of relevant forms based on real templates, risk register, and approval tracker.
4. **Logistics pack** — venue comparison, catering plan, equipment/setup checklist, booking status, and running order.
5. **Registration pack** — live form link if created through an authorised tool, otherwise form specification and tracker template.
6. **Marketing pack** — event description, email invitation, social copy, poster brief, and promotion timeline.
7. **Task tracker** — tasks, owners, due dates, dependencies, statuses, and blockers.
8. **Completion report** — generated artifacts, validation results, assumptions, unresolved issues, and decisions awaiting approval.

Generate only deliverables that are requested or necessary for the event. Do not imply that a draft is an approved institutional document.

---

## 14. Validation and Quality Control

Validation is a core product feature, not a final cosmetic step.

### Required checks

- Budget sums match the line items and use the correct currency.
- Total estimated spending is compared with the budget ceiling.
- Attendance expectations do not exceed confirmed venue capacity.
- The event date and time agree across documents.
- Registration deadline and attendance limit are consistent.
- Promotional copy does not publish unconfirmed details as facts.
- Each requested artifact exists and can be opened where link verification is available.
- Compliance requirements have source references or are clearly labelled unverified.
- Approval-dependent actions are not represented as completed prematurely.
- Tasks have valid statuses and dependencies.
- Blocked or failed tasks are listed in the final report.

Prefer deterministic checks and code/tool-based arithmetic for calculations instead of relying only on language-model judgment. Where a check cannot be performed, mark it as not verified rather than passing it by default.

### Final outcome statuses

- **Complete:** all required outputs exist and all mandatory checks pass.
- **Complete with outstanding actions:** requested draft outputs exist, but some bookings, approvals, or decisions remain pending and are clearly disclosed.
- **Blocked:** a key dependency or missing decision prevents safe progress.
- **Failed:** execution failed after reasonable recovery attempts; explain what failed and retain any valid partial work.

---

## 15. Human Approval and Safety Boundaries

The system should automate preparation and coordination, but distinguish preparation from consequential action.

Require explicit approval before, at minimum:

- Submitting official university/EHS/safety forms.
- Confirming venue bookings or accepting contractual terms.
- Spending money, paying invoices, or making financial commitments.
- Sending mass emails or public announcements.
- Publishing content under a university or organisation's name.
- Sharing attendee personal data with third parties.
- Making material changes to an already approved event plan.

Follow the institution's actual policy and the user's authority. A user request alone does not mean they have the right to bypass formal approval.

Store approval status and evidence. Provide a preview of the exact action and content before requesting approval. After approval, report the actual result of execution.

---

## 16. MVP Scope and Priorities

The vision contains six specialists and three interfaces. Implement in a sequence that proves the core outcome before adding every integration.

### P0 — Required for a credible demonstration

- One Event Coordinator with a clear plan/execute/validate/deliver lifecycle.
- Six defined specialist roles, even if some are initially implemented as bounded workflows within the available platform.
- Shared event facts and task status.
- At least three actual deliverable types generated through available tools.
- Budget arithmetic and cross-document consistency validation.
- Clear handling of missing information, failures, and human approvals.
- A final event pack with working artifact references.
- Demonstrable use of WorkBuddy as the primary execution platform.

### P1 — Important for the product vision

- Telegram entry point connected to the same event workflow.
- Web chat connected to the same event workflow.
- Persistent event workspace with status and deliverables.
- Task/approval history and event resume capability.
- Specialist execution in parallel where supported.
- Retry and correction flows for failed validation checks.

### P2 — Add only after core execution works

- Live registration form creation through supported integrations.
- Calendar/task-management connectors.
- Venue or supplier discovery from verified sources.
- Notifications and reminders.
- Role-based access for committees and event teams.
- Reusable templates for different event categories.
- Post-event attendance and expense reconciliation.

Do not spend most development time on polished UI before the coordinator can complete and validate a real workflow.

---

## 17. Acceptance Criteria

The first credible end-to-end version should meet these checks.

### Goal understanding

- Given a sample event request, the system captures budget, target attendance, event type, desired outputs, and known constraints.
- It asks about critical missing details or records a clearly labelled assumption.

### Planning and delegation

- It creates an inspectable task plan.
- Tasks are assigned to appropriate specialist roles.
- Dependencies are represented and respected.
- Independent work is parallelised only when supported and safe.

### Execution

- The system generates actual artifacts, not merely promises to generate them.
- At least three useful deliverables are created and accessible in the demo.
- Each artifact's draft/final/approval status is clear.

### Validation and adaptation

- The system catches a deliberately introduced budget inconsistency or over-budget scenario.
- It catches at least one cross-document conflict, such as conflicting dates or capacity.
- It retries or requests a user decision when appropriate.
- It reports checks that were not possible instead of pretending they passed.

### Integration and delivery

- The final report links to all created deliverables.
- It lists outstanding tasks, assumptions, risks, and required approvals.
- It does not misrepresent drafts, unverified information, or failed actions as complete.

### Multi-channel behaviour

- Telegram, WorkBuddy chat, and the website are intended to coexist and use the same event model/workflow.
- At minimum, document and test each channel's actual supported route to the coordinator.
- Where cross-channel persistence is implemented, starting an event in one channel and resuming it from another does not create conflicting duplicate event records.

---

## 18. Demo Plan for Judges

Use one standard scenario and two deliberate failure/edge scenarios.

### Demo A — Standard event

Prompt: "Organise a postgraduate networking event for 50 people with a maximum budget of RM1,500. Prepare the event plan, registration materials, promotion pack, and task tracker."

Show:

- Goal extraction and the master plan.
- Specialist task assignments.
- Actual file creation.
- Validation checks.
- Final event pack and status summary.

### Demo B — Budget conflict

Change the event constraints or sample data so the estimated total exceeds RM1,500.

Show that Finance identifies the overrun, the coordinator sends the issue for revision or asks the user to choose a trade-off, and dependent outputs are updated rather than left inconsistent.

### Demo C — Missing/contradictory operational detail

Provide missing venue information or conflicting capacity details in the input data.

Show that the system flags the problem, does not invent confirmation, and records the issue or asks a focused question.

### Suggested demo metrics

- Time from initial prompt to first useful deliverables.
- Number of requested artifacts actually created.
- Number of seeded errors correctly detected.
- Budget calculation accuracy.
- Cross-document consistency pass rate.
- Number of manual interventions required.
- Number of unresolved items transparently surfaced.

Do not invent performance numbers in the presentation; measure them during tests.

---

## 19. Risks and Mitigations

| Risk | Mitigation |
|---|---|
| WorkBuddy features/API unavailable in the competition account | Verify access before committing to architecture; use documented supported routes only. |
| Telegram integration routes messages to a generic assistant rather than the custom coordinator | Test routing early; use an approved bot/backend integration if permitted. |
| Three interfaces create three separate event states | Use a shared event ID and persistent event store; define a common request/response contract. |
| Agent outputs contradict each other | Shared approved facts, explicit dependencies, cross-document validation, and coordinator-owned conflict resolution. |
| Fabricated venue availability or policy requirements | Require verifiable sources; label estimates and unknowns; prohibit false completion claims. |
| Unsafe automatic submission or booking | Human approval gates and audit records. |
| Personal information mishandled in attendee lists | Minimise data collection, restrict access, and avoid logging unnecessary personal data. |
| Long-running tasks time out in chat integrations | Use background jobs where supported, persist state, provide progress updates, and allow resume/retry. |
| Agent loops or uncontrolled retries | Bound retries, set task limits, log failures, and escalate after repeated failure. |
| Too much scope for the hackathon | Prove one end-to-end workflow first; stage channel integrations and optional features. |
| Coding method conflicts with Track 2 tool rules | Confirm organiser policy before using Codex or any other disallowed development assistant. |
| npm package is mistaken for a native WorkBuddy agent install | Ship and test separate, clearly documented npm and WorkBuddy-compatible artifacts; never imply npm alone registers an Expert Team. |
| WorkBuddy package format or marketplace publication requires approval | Validate the native bundle locally/through the supported developer flow early; document review or account prerequisites. |
| Open-source users expose their own secrets or attendee data | Provide safe examples, local secret handling, minimal permissions, and a security policy. |

---

## 20. Technical Decisions to Make Before Implementation

These are open questions, not settled design facts.

1. **WorkBuddy execution route:** Which agent/Expert Team feature and API can be used in the competition account?
2. **Third-party access:** Does the team have permission to register a web application and invoke WorkBuddy tasks through an API?
3. **Telegram routing:** Can Telegram messages enter the same custom coordinator, or is a separate adapter required?
4. **Persistence:** Which approved data store should hold event records, tasks, artifacts, and approvals?
5. **Artifact generation:** Which tools can create documents and spreadsheets and return reliable links?
6. **Live forms:** Which form service, if any, may be called to create a working registration form?
7. **Institutional compliance:** Which official university policies, EHS templates, and approval forms may be used as sources?
8. **Hosting and authentication:** Where can the web application run, and how will user identity and event access be protected?
9. **Agent collaboration:** Does WorkBuddy support the desired specialist-agent pattern natively, or must it be represented as a coordinator-driven task workflow?
10. **Competition rule interpretation:** Are any development tools besides WorkBuddy prohibited for Track 2, including Codex? Obtain an explicit answer.

Do not invent APIs, credentials, or capabilities to fill these gaps. Inspect the available environment, read current official documentation, and ask the user for missing access or decisions when needed.

---

## 21. Instructions for the Coding Agent Working from This Brief

Before editing the repository:

1. Inspect the repository structure, current dependencies, existing code, and available scripts.
2. Identify the current stack and any existing integration with WorkBuddy, Telegram, databases, or hosting.
3. Report which requirements the repository already satisfies and which are missing.
4. Separate confirmed platform capabilities from assumptions.
5. Propose a staged implementation plan before making broad changes.

During implementation:

- Preserve working code unless a change is necessary.
- Prefer small, verifiable changes over a large rewrite.
- Use typed request/response contracts where the stack supports them.
- Keep secrets in environment variables or a secret manager; provide an `.env.example` with placeholder names only.
- Never place tokens, API keys, or private attendee data in source control or client-side bundles.
- Add error handling, timeouts, bounded retries, and useful logs without logging sensitive data.
- Create mock adapters for local tests when external credentials are not available, but label them as mocks and never present mock execution as a successful real integration.
- Add tests for budget calculations, state transitions, dependency handling, conflict detection, and artifact status.
- Make the application honest about what it has and has not executed.
- Use official documentation for WorkBuddy and Telegram integrations; verify API contracts before coding.
- Do not silently replace WorkBuddy with a different model/runtime for the primary agentic work.
- Do not add unrequested features simply because they seem useful.

At the end of each milestone, report:

- Files created or changed.
- Functionality implemented.
- Tests run and outcomes.
- Integrations verified versus mocked.
- Known issues and next steps.

### Suggested milestones

**Milestone 1 — Repository and platform audit**  
Inspect the existing project and verify WorkBuddy/Telegram integration feasibility.

**Milestone 2 — Event domain and shared state**  
Define event, task, artifact, approval, and status types; implement state transitions and tests.

**Milestone 3 — Coordinator and specialist contracts**  
Implement the coordinator workflow and the six bounded specialist roles using the supported WorkBuddy execution mechanism.

**Milestone 4 — Deliverable generation and validation**  
Create a minimum event pack and automated consistency checks.

**Milestone 5 — One end-to-end vertical slice**  
Run a sample event from one interface through execution, validation, and final artifact delivery.

**Milestone 6 — Telegram and web adapters**  
Connect both channels to the shared workflow and verify event-state consistency, subject to permissions.

**Milestone 7 — Packaging and open-source readiness**  
Create the native WorkBuddy bundle, setup/diagnostic CLI as needed, installation docs, license, security guidance, and package validation. Test on a clean environment. Publish to npm only after the package name, WorkBuddy install path, and credentials model are verified. WorkBuddy marketplace publication is a separate platform process and may require approval.

**Milestone 8 — Hardening and demo**  
Test failures, approvals, seeded conflicts, installation from a clean environment, security boundaries, and judge scenarios.

Do not start by implementing all three interfaces in parallel. First prove that the central workflow can complete one event reliably.

---

## 22. Definition of Done

A milestone is not done merely because code exists. It is done when the intended behaviour can be demonstrated and verified.

For the first end-to-end MVP, the definition of done is:

- A user can submit a realistic event request.
- The coordinator creates a structured plan.
- The plan assigns bounded tasks to the six specialist roles or supported equivalents.
- The system creates multiple real, usable deliverables through the approved WorkBuddy-led workflow.
- Validation detects seeded budget and consistency errors.
- The coordinator corrects errors or requests a clear human decision.
- The final report provides artifact links, check results, assumptions, and unresolved approvals.
- The system truthfully distinguishes real integrations from mocks.
- No restricted action is performed without required approval.
- The workflow is documented and repeatable for the hackathon demonstration.
- The public repository includes a license, installation guide, safe configuration examples, and contribution/security guidance.
- The WorkBuddy-compatible package is validated through the supported import/install path.
- The npm package (if selected and published) installs and its documented commands run in a clean environment.
- Documentation distinguishes npm installation from native WorkBuddy registration and calls out any platform review or manual import requirements.

The complete product vision additionally requires Telegram, native WorkBuddy, and website access to coexist over the same shared workflow and event state, with an open-source release path that other developers can reproduce. If any channel cannot be completed within the competition constraints, document the limitation plainly and demonstrate the working supported paths without claiming the missing path is implemented.

---

## 23. Final Product Definition

Campus Event Agent is a multi-channel, WorkBuddy-led agentic system for planning and coordinating university events. A central Event Coordinator manages six specialist workstreams—Compliance & Safety, Registration, Logistics, Marketing & Communications, Finance & Budgeting, and Work Distribution—to turn a natural-language event request into a coherent, validated event pack.

Telegram, native WorkBuddy chat, and a dedicated website are intended to coexist as interfaces to the same underlying workflow and shared event state. The project should live in a public GitHub repository and offer a repeatable developer installation path through npm, alongside a WorkBuddy-compatible agent/team package or documented platform distribution route. The npm package must not imply that native WorkBuddy registration happens automatically unless that flow is verified and supported.

The system succeeds when it performs real work, coordinates its specialists, checks the consistency of their outputs, adapts to problems, delivers useful artifacts with clear evidence of what is complete and what still requires human action, and can be installed and tested by another developer using the published instructions.

**Build the reliable end-to-end workflow first. Validate the WorkBuddy-native package. Then make setup repeatable and add the three interfaces around the same workflow. Never confuse a generated plan with completed work—or an npm install with verified WorkBuddy installation.**
