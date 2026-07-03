# AI Agent Build Prompt: Argos

---

## Project Context

You are building a personal developer productivity tool called **Argos**. It is a fully automated pipeline that watches for incoming GitLab merge request notifications (arriving as emails), pulls the full MR context, runs an AI-assisted review using the repository's own documentation and conventions, and delivers a private Markdown report to the developer — all without touching the developer's working environment or posting anything to GitLab.

The user is a developer working on WSL2. They have `glab` CLI and `antigravity` CLI (`agy`) already installed and authenticated, configured with model `gemini-3.1-pro`. All repositories they work on live under a local workspace directory (e.g. `~/Workspace/SourceCode/`). The system must support multiple repositories, classify each MR by type (Feature, Bug Fix, Unit Test), and complete the full pipeline within 5 minutes of receiving the trigger event.

This is a personal automation tool, not a team platform. It must never post to GitLab, never modify code, and never touch the user's active Git working tree.

---

## How to Use This Prompt

Read all phases before writing a single line of code. Understand the full arc of the system first, then build phase by phase. Each phase assumes the previous one is complete and working — do not leave stubs, placeholder functions, or TODO comments when marking a phase done. Write real, working code for everything that falls within a phase's scope.

The completion condition for each phase describes the **behavior of the system**, not a list of files. Use those conditions as your acceptance test before moving to the next phase.

When a phase references a document, read the relevant sections before designing your solution for that phase. The documents contain decisions that have already been made — architecture, naming, directory layout, configuration shape, report structure — and your implementation must be consistent with them.

The project language is **TypeScript**. The runtime is **Node.js** on **WSL2**. Persistence is **SQLite**. Make architectural decisions that serve long-term maintainability: keep layers clearly separated, keep the reviewer decoupled from any specific repository's implementation, and write code that recovers gracefully from external failures.

---

## Source Documents

All architectural decisions, functional requirements, non-functional requirements, and acceptance criteria live in two documents. These are your source of truth throughout the entire build.

- `docs/Argos_Idea.md` — The design document. Contains the architecture diagram, worktree strategy, context strategy, technology stack, configuration shape, and review output structure.
- `docs/Argos_PRD.md` — The product requirements document. Contains all FRs (FR-001 through FR-012), NFRs, assumptions, risks, MVP scope, and the 11 acceptance criteria.

Copy both files into the `docs/` directory of the project before starting Phase 1.

---

## Phase 1: Foundation & Infrastructure

### What You Are Building

The structural skeleton of the entire application. This is the layer that every other phase will depend on — configuration management, database initialization, logging, and the entry point that starts the process and keeps it running.

### Purpose

A system with hard-coded values, no validation, and silent failures will break in production in ways that are difficult to debug. This phase exists to make the system honest: it knows its own configuration, tells you clearly when something is wrong, and produces observable, structured output from the first line of execution. Every subsequent phase inherits these guarantees.

### Goal

By the end of this phase, the project should have a working, typed configuration system that reads from a local file and validates the shape and presence of all expected values before allowing the application to proceed. The database should be initialized automatically on startup with the correct schema to support everything the system will persist later. Structured logging should be in place. The application should have a single, clean entry point that orchestrates startup — configuration loading, validation, database initialization, and process lifecycle — and fails loudly and clearly if any of these prerequisites are not met.

Think carefully about what the system will eventually need to store: review records, event tracking, and state for deduplication. The schema you design here will be used by all future phases. Think ahead.

### Completion Condition

The process starts cleanly from the command line. It reads the configuration file, validates all required fields, and initializes the database. If the configuration file is missing, has an invalid structure, references a repository path that does not exist on disk, or omits a required field, the process exits immediately with a specific, human-readable error that tells the developer exactly what is wrong and where. If everything is valid, the process reports a successful startup and remains running. No phase of startup should succeed silently after a prerequisite has failed.

### Reference Documents

- `Argos_Idea.md` → Technology Stack, Configuration Example, Repository Structure
- `Argos_PRD.md` → Technology Stack table, FR-012, Assumptions, Security NFR

---

## Phase 2: Event Ingestion Layer

### What You Are Building

The system's front door. This is the component that receives external trigger events from Google Apps Script, extracts the meaningful MR data from the notification payload, and feeds validated events into an internal processing queue. It also includes the companion Google Apps Script code that forwards email notification content to this endpoint.

### Purpose

The system has no way to know a merge request exists until something tells it. GitLab webhooks are not available, so the trigger arrives indirectly — as a Gmail notification, processed by a Google Apps Script, which then calls this system's endpoint. This phase defines and implements that entire inbound contract: what the Apps Script sends, what the endpoint accepts, how invalid or irrelevant payloads are handled, and how valid events are buffered for downstream processing without blocking the HTTP response.

Consider that the user may receive many email notifications — from multiple repositories, different event types (MR opened, updated, commented on), and potentially at the same time. The ingestion layer needs to know which ones to care about, what to extract from them, and how to handle a burst of events without losing any.

### Goal

The system is capable of receiving an HTTP POST containing a forwarded GitLab MR notification payload and producing a structured, typed MR event object that downstream phases can act on. The endpoint handles concurrent requests gracefully. Payloads that do not represent a relevant MR event (wrong event type, unrecognized repository, malformed content) are rejected with appropriate logging but without crashing the server. The Google Apps Script is written and documented, ready to be deployed to the user's Google account.

### Completion Condition

When the endpoint receives a realistic GitLab MR notification payload (simulate this with a test HTTP request), it extracts all the fields defined in the project requirements and produces a correctly typed internal event. When it receives a malformed, empty, or irrelevant payload, it responds with an appropriate error code and logs the reason. The server remains responsive after both successful and failed ingestion. Multiple simultaneous requests do not cause events to be dropped or processed twice. The Google Apps Script code exists in the project, is documented with setup instructions, and sends a payload shape consistent with what the endpoint expects.

### Reference Documents

- `Argos_Idea.md` → High-Level Architecture (the Google Apps Script → HTTP Endpoint step), Technology Stack
- `Argos_PRD.md` → FR-001, FR-002, FR-010, Reliability NFR, Assumptions

---

## Phase 3: GitLab & Repository Integration Layer

### What You Are Building

The layer that transforms an abstract MR event (an ID, a project name, a URL) into real, reviewable content — a fully checked-out branch in an isolated workspace, with the MR's diff, metadata, and branch lineage available. This phase also handles routing: given any incoming MR event, the system determines which of the configured repositories it belongs to and where that repository lives on disk.

### Purpose

The review engine in the next phase needs more than an MR ID. It needs the actual changed files, the diff, the MR's description, and the target branch. All of that comes from GitLab — but since no webhook or API key is maintained directly by this system, it goes through `glab` CLI, which is already authenticated. This layer also enforces a critical constraint: the developer's own working tree must never be affected. Every review runs in an isolated Git worktree that is created for the review and removed when it is done — even if the review fails halfway through.

Think about what happens when the glab CLI is not authenticated, when a repository exists in the config but not on disk, when a worktree from a previous crashed run was never cleaned up, or when two MR events for different repos arrive at the same time. All of these need to be handled here.

### Goal

Given a validated MR event from Phase 2, the system can: identify the correct local repository for that MR by matching it to the configuration; fetch the full MR details, diff, and target branch metadata using `glab` CLI; create a temporary Git worktree with the MR's branch checked out and up-to-date; and guarantee that the worktree is removed when the review process finishes — whether it succeeds, fails, or is interrupted. Multiple simultaneous reviews against different repositories should not interfere with each other.

### Completion Condition

A simulated MR event for a known repository results in a temporary worktree being created at the correct path, with the MR branch checked out and the diff accessible. A simulated event for an unknown repository is caught and logged clearly at the resolution step, without creating any worktree. When a review process exits or throws at any point after worktree creation, the worktree is still removed. Running the system twice in a row with the same MR event does not leave two worktrees. The layer also detects and removes any orphaned worktrees that exist from prior failed runs before starting a new review.

### Reference Documents

- `Argos_Idea.md` → High-Level Architecture, Worktree Strategy (full workflow), Repository Structure, Configuration Example, Technology Stack (GitLab Integration section)
- `Argos_PRD.md` → FR-003, FR-004, FR-011, FR-012, Assumptions, Risks (glab CLI auth expiry, Missing local repository, Worktree cleanup failures)

---

## Phase 4: AI Review Engine

### What You Are Building

The intelligence core of the system. This phase takes a prepared worktree and everything known about the MR, loads the repository's own knowledge base (its documented conventions, agent rules, workflows, and architecture artifacts), classifies what kind of change the MR represents, and invokes Antigravity CLI to produce a structured, type-aware review report.

### Purpose

The review should not be generic. It should reflect the actual standards and conventions of the repository being reviewed — not some default checklist. Each repository carries its own documentation that describes how it is built, what patterns it follows, and what rules reviewers should apply. This layer reads that documentation directly from the worktree and feeds it into the review prompt so that Antigravity CLI (agy) is acting as a reviewer who already knows the project.

The review also needs to adapt to what the MR is actually doing. Reviewing a new feature requires different questions than reviewing a bug fix or a set of new unit tests. The classification logic and the prompt construction must be done thoughtfully — the MR title is a hint, but the diff itself is the ground truth.

Think about what the prompt should look like for each MR type. Think about what context to include, how to keep the prompt within practical size limits when the diff is large, and how to parse and structure the output Antigravity CLI returns into a clean Markdown report. Antigravity CLI (agy) is invoked as a subprocess, not via API — the integration is command-line based, using model `gemini-3.1-pro`.

### Goal

Given a prepared worktree, MR metadata, and a diff, the system loads the target repository's context files, classifies the MR as Feature, Bug Fix, or Unit Test, constructs an appropriate prompt that incorporates both the repository context and the MR content, invokes Antigravity CLI (agy) with model gemini-3.1-pro, and produces a structured Markdown report whose sections match the MR type as defined in the project documents. The report is the primary deliverable of the entire system.

### Completion Condition

For each of the three MR types, the produced report contains all common sections and all type-specific sections as specified in the project documents — no missing sections, no extra generic boilerplate that isn't part of the defined structure. The prompt incorporates content from at least `AGENTS.md`, `.agents/rules/`, `.agents/workflows/`, and any available Graphify artifacts found in the worktree. When context files are missing or a directory is empty, the system continues without failing — it uses what is available. When the diff is very large, the system applies a strategy to stay within practical prompt limits rather than crashing. Antigravity CLI (agy) failures are caught and the error is surfaced clearly.

### Reference Documents

- `Argos_Idea.md` → Context Strategy, Review Output (all three MR type classifications and their sections), Technology Stack (AI Engine)
- `Argos_PRD.md` → FR-005, FR-006 (the full MR classification logic and all report sections), Risks (Large merge requests, Antigravity CLI (agy) failures)

---

## Phase 5: State Management, Deduplication & Report Storage

### What You Are Building

The system's memory. This phase implements the full SQLite data model, the logic that prevents the same MR revision from being reviewed twice, the mechanism for saving generated reports to disk, and the metadata records that track what the system has done and when.

### Purpose

Without persistent state, the system has no continuity. A user who receives two email notifications for the same MR update (which GitLab can send) would trigger two identical reviews. A developer who wants to look back at a review they received three days ago would have no way to find it. This phase gives the system a persistent record of its own work and the ability to recognize when it has already done something.

The deduplication logic is the most important correctness guarantee in the system. It must be based on a combination of MR identity and the specific revision of code that was reviewed — because the same MR can be legitimately re-reviewed when new commits are pushed.

Think carefully about the data model. It needs to serve not just this phase, but also future phases (notifications, history dashboards, analytics). Design it to be queryable and extensible. Think about what metadata is worth recording for each review.

### Goal

The system records every review attempt — successful or not — in SQLite. When an event arrives for an MR whose current HEAD commit has already been reviewed, the system recognizes this and skips the review entirely, logging the reason. When a review completes successfully, the Markdown report is saved to the correct directory under the project's `reviews/` folder with a sensible, consistent filename. Report metadata (MR ID, repo, type, timestamp, report path, commit SHA, outcome) is persisted to the database. The system handles concurrent review attempts for different MRs safely.

### Completion Condition

Sending the same MR event twice results in exactly one review being generated and one report file on disk. The second attempt is detected as a duplicate and skipped before any expensive work (glab calls, worktree creation, Antigravity CLI (agy) invocation) begins. A review that fails mid-pipeline is still recorded in the database with a failed status and the reason. A review that succeeds has a corresponding Markdown file in the `reviews/` directory and a complete metadata record in the database. Querying the database directly shows an accurate history of what has been reviewed, when, at which commit, and with what outcome.

### Reference Documents

- `Argos_Idea.md` → Repository Structure (`reviews/` and `state/` directories), Technology Stack (Persistence: SQLite)
- `Argos_PRD.md` → FR-007, FR-008, Reliability NFR, Performance NFR

---

## Phase 6: Delivery, Resilience & End-to-End Pipeline

### What You Are Building

The final assembly. This phase wires all previous phases into a single coherent, observable pipeline; adds Telegram delivery as an optional notification channel; implements retry and recovery logic throughout; adds the startup cleanup routine for orphaned worktrees; and validates the system end-to-end against the project's acceptance criteria.

### Purpose

Individual phases working correctly in isolation is not the same as a system working correctly under real conditions. This phase is where the seams between phases get tested and hardened. Network calls fail. Antigravity CLI (agy) occasionally returns malformed output. `glab` token expiry is detectable. The event queue may have items from before a crash. The 5-minute end-to-end SLA has to be met consistently, not just on a good day. This phase makes the system production-worthy.

Think about the pipeline as a series of stages, each of which can fail independently. The system should be able to tell you — through its logs — exactly which stage failed, why, and what it is going to do about it. Some failures are worth retrying (transient network errors). Others should abort the review and record the failure (missing repository, invalid worktree). Consider where retries make sense and where they would be harmful.

The Telegram notification is optional — the system must work correctly with or without it configured. If a Telegram token and chat ID are not present in the configuration, the notification step is simply skipped. If they are present but the notification fails, the review is still saved and the failure is logged.

### Goal

The full pipeline — from an HTTP event arriving at the endpoint, through repository resolution, worktree creation, context loading, AI review, deduplication check, report storage, and notification delivery — runs end-to-end without manual intervention. Every stage handles its own failure modes. The system is observable enough that a failure at any stage can be diagnosed from the logs alone. The startup routine removes any orphaned worktrees before beginning to accept events. If Telegram is configured, a notification is sent when a report is ready. The full pipeline completes within 5 minutes.

### Completion Condition

Walk through every item in the acceptance criteria section of the PRD (items 1 through 11). Each one must be demonstrably true with a real or realistic simulated end-to-end run. Specifically: the pipeline completes within 5 minutes; a duplicate revision is caught before any expensive work starts; the worktree is gone after the review, regardless of whether the review succeeded or failed; the Telegram notification is sent if configured; and a failed review at any stage leaves the system in a clean, recoverable state — no orphaned worktrees, a failure record in the database, and a log entry that describes exactly what went wrong.

The system should be runnable with a single start command. The Google Apps Script, once deployed, should require no further configuration on the user's part. A developer receiving their first MR notification should need zero manual steps between the email arriving and the report appearing on disk.

### Reference Documents

- `Argos_Idea.md` → High-Level Architecture (the full flow), Worktree Strategy, Technology Stack (Notifications)
- `Argos_PRD.md` → FR-009, FR-011, Reliability NFR, Performance NFR (5 minutes), Risks (all entries), Acceptance Criteria (all 11 items), Security NFR
