# Product Requirements Document (PRD)

# AI Reviewer Agent

Version: 1.0

Owner: (Author)

Status: Draft

---

# Objective

Create a personal AI-powered merge request review assistant that automatically produces review summaries and findings for selected GitLab repositories without requiring administrative permissions.

---

# Background

Current review workflows rely heavily on manual effort.

Constraints include:

- No GitLab webhook permissions.
- No Google Chat bot permissions.
- Existing Google Chat notifications contain excessive noise.
- The target repositories already contain rich project context through AGENTS.md and Graphify.

The proposed solution leverages GitLab email notifications as an event source.

---

# Technology Stack

| Layer                 | Technology                                   |
| --------------------- | -------------------------------------------- |
| Core Runtime          | Node.js, TypeScript                          |
| Execution Environment | WSL2                                         |
| AI Engine             | Antigravity CLI (agy), model: gemini-3.1-pro |
| GitLab Integration    | glab CLI (pre-installed, read permissions)   |
| Persistence           | SQLite                                       |
| Email Integration     | Gmail Filters, Google Apps Script            |
| Version Control       | Git, Git Worktree                            |
| Notifications         | Telegram Bot API (optional)                  |

---

# Success Metrics

The project is considered successful if:

- Merge requests are automatically detected through email notifications.
- AI review reports are generated without manual intervention.
- Reports utilize repository-specific context.
- The user's active development environment remains unaffected.
- The user receives review output within 5 minutes of notification arrival.

---

# User Persona

Primary User:

- Individual developer.
- Uses WSL2.
- Uses Antigravity IDE.
- Reviews merge requests from teammates across multiple repositories.
- Works on multiple frontend repositories across the team.

---

# Functional Requirements

## FR-001 Email Detection

The system shall process Gmail messages labeled for merge request notifications.

---

## FR-002 MR Extraction

The system shall extract:

- Merge request URL.
- Project name.
- Merge request identifier.
- Merge request title.

from notification emails.

---

## FR-003 Repository Resolution

The system shall determine the local repository path associated with the merge request using the local configuration file.

The system shall support multiple configured repositories simultaneously, routing each incoming MR event to the correct local path.

---

## FR-004 Worktree Isolation

The system shall execute reviews within temporary Git worktrees.

The developer's active branch shall remain unchanged.

---

## FR-005 Context Loading

The system shall expose repository context to Antigravity CLI (agy), including:

- AGENTS.md
- .agents/rules
- .agents/workflows
- Graphify artifacts

---

## FR-006 AI Review

The system shall invoke Antigravity CLI (agy) with model gemini-3.1-pro to classify the MR as one of the following types based on the MR title and diff content:

- **Feature** — introduces new functionality.
- **Bug Fix** — resolves an existing defect.
- **Unit Test** — adds or modifies test coverage without changing production logic.

The system shall generate a report with sections common to all MR types:

- MR Type Classification
- Executive Summary
- Key Changes
- Potential Bugs
- Security Concerns
- Performance Concerns
- Review Questions

For **Feature** MRs, the report shall additionally include:

- Design & Architecture Notes
- API or Contract Changes
- Missing Test Scenarios

For **Bug Fix** MRs, the report shall additionally include:

- Root Cause Assessment
- Fix Correctness
- Regression Risk
- Missing Test Coverage

For **Unit Test** MRs, the report shall additionally include:

- Coverage Assessment
- Test Quality & Assertions
- Missing Scenarios
- Test Maintainability

---

## FR-007 Duplicate Prevention

The system shall avoid reviewing identical merge request revisions.

Tracking shall be based on merge request identifier and commit SHA, persisted in SQLite.

---

## FR-008 Report Storage

The system shall store generated Markdown reports locally.

Report metadata shall be persisted in SQLite.

---

## FR-009 Notifications

The system should optionally notify the user via Telegram upon report generation.

---

## FR-010 HTTP Trigger Endpoint

The system shall expose a local HTTP endpoint to receive forwarded merge request events from Google Apps Script.

The endpoint shall accept notification payloads and enqueue them for processing.

---

## FR-011 Worktree Cleanup

The system shall automatically remove temporary worktrees after review completion or upon failure.

The system shall run a periodic cleanup job to recover from orphaned worktrees.

---

## FR-012 Configuration Management

The system shall load repository configuration from a local configuration file.

The system shall validate configuration on startup and report missing or misconfigured entries clearly.

---

# Non-Functional Requirements

## Performance

Reports should be produced within 5 minutes of notification receipt.

---

## Reliability

The system should recover gracefully from:

- Git failures.
- Antigravity CLI (agy) failures.
- Network failures.
- Invalid email payloads.

---

## Maintainability

The reviewer must remain decoupled from repository implementations.

Repository standards must remain the responsibility of each repository.

---

## Security

The system shall:

- Rely on glab CLI's existing authentication; no GitLab tokens shall be stored separately by the agent.
- Avoid exposing repository contents externally.
- Operate solely on the local machine.

---

# Assumptions

- GitLab notifications are available through email.
- Gmail filters can be configured.
- Antigravity CLI (agy) is installed in WSL2.
- glab CLI is installed in WSL2 and authenticated with read permissions.
- Local clones of reviewed repositories already exist on the developer's machine.

---

# Risks

| Risk                           | Impact | Mitigation                            |
| ------------------------------ | ------ | ------------------------------------- |
| Email format changes           | Medium | Use resilient parsing                 |
| Antigravity CLI (agy) failures | Medium | Retry mechanisms                      |
| glab CLI auth expiry           | Medium | Detect auth errors and alert the user |
| Missing local repository       | High   | Configuration validation (FR-012)     |
| Large merge requests           | Medium | Context reduction strategy            |
| Worktree cleanup failures      | Low    | Automatic cleanup job (FR-011)        |

---

# MVP Scope

Included:

- Gmail filter integration.
- Google Apps Script bridge.
- HTTP trigger endpoint.
- Node.js + TypeScript review service.
- SQLite persistence.
- glab CLI integration for MR data fetching.
- Multi-repository support.
- Git worktree execution and cleanup.
- Antigravity CLI (agy) execution.
- MR type classification (Feature / Bug Fix / Unit Test).
- Type-aware Markdown report generation.
- Duplicate prevention.
- Configuration management and validation.

Excluded:

- GitLab comments.
- Web dashboard.
- Automatic approvals.
- Multi-user support.
- Team collaboration features.
- Telegram notifications (optional; planned for Phase 2).

---

# Future Scope

Phase 2:

- Telegram notifications.
- HTML reports.
- Slack or Discord notifications.

Phase 3:

- Review history dashboard.
- Review analytics.
- Trend analysis across reviews.
- Incremental diff reviews.
- Review caching.
- Reviewer workload insights.
- Reviewer assignment prioritization.

---

# Acceptance Criteria

The MVP shall be accepted when:

1. A merge request email from any configured repository is received.
2. Google Apps Script forwards the event to the HTTP trigger endpoint.
3. The reviewer identifies the corresponding repository from configuration.
4. A temporary worktree is created using glab CLI to fetch MR details and diff.
5. The MR is correctly classified as Feature, Bug Fix, or Unit Test.
6. Antigravity CLI (agy) with model gemini-3.1-pro generates a type-aware review report.
7. The review is saved locally as a Markdown report.
8. The active development environment remains unaffected.
9. A duplicate MR revision is detected and not re-reviewed.
10. The temporary worktree is removed after review completion.
11. The full pipeline completes within 5 minutes of notification receipt.
