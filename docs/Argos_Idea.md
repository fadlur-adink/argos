# Argos

## Overview

Argos is a personal automation tool designed to provide AI-assisted merge request summaries and code review insights without requiring GitLab webhook permissions or modifications to the target repository.

The system monitors GitLab merge request notifications delivered through email, automatically triggers an AI review process, and produces private reports for the user.

This project is intended for individual productivity enhancement and does not interact with GitLab merge requests by posting comments, approvals, or discussions.

---

# Problem Statement

As a developer, I often need to review merge requests created by other team members. However:

- I do not have permission to configure GitLab webhooks.
- I cannot install custom Google Chat bots.
- Existing Google Chat notifications are noisy and contain notifications from multiple repositories.
- Manual code reviews consume significant cognitive effort.

I need a system that automatically generates an initial review summary and highlights potential concerns before I begin the actual review process.

---

# Goals

- Automatically detect merge requests across multiple configured repositories.
- Generate private AI-assisted review reports.
- Reuse the existing repository context, including:
  - AGENTS.md
  - .agents/rules
  - .agents/workflows
  - Graphify artifacts

- Avoid any modifications to GitLab merge requests.
- Operate entirely within existing permission boundaries.

---

# Non-Goals

The system will NOT:

- Post comments to GitLab.
- Approve merge requests.
- Reject merge requests.
- Modify repository code.
- Replace human review.
- Depend on Antigravity IDE APIs.

---

# High-Level Architecture

GitLab

↓

GitLab Notification Email

↓

Gmail Filter

↓

Google Apps Script (HTTP POST)

↓

Argos HTTP Endpoint (WSL2)

↓

glab CLI

↓

Antigravity CLI (agy)

↓

Markdown Report / Telegram Notification (optional)

---

# Repository Structure

```
/home/user/Workspace/SourceCode/

├── example-frontend/
│   ├── AGENTS.md
│   ├── .agents/
│   │   ├── rules/
│   │   └── workflows/
│   ├── graphify/
│   └── ...
│
├── another-repo/
│   ├── AGENTS.md
│   ├── .agents/
│   └── ...
│
└── argos/  (this project)
    ├── src/
    ├── prompts/
    ├── reviews/
    ├── state/
    ├── config/
    ├── docs/
    ├── package.json
    └── README.md
```

---

# Context Strategy

The reviewer itself does not own repository knowledge.

Repository knowledge lives inside the target repository.

The reviewer reads context directly from:

```
AGENTS.md
.agents/rules/*
.agents/workflows/*
graphify/*
```

This ensures that review standards remain synchronized with the source repository.

---

# Worktree Strategy

The reviewer must not disturb the developer's current working tree.

The system uses Git worktrees.

Example:

```
example-frontend/
    (active development)

review-worktree/
    (temporary review environment)
```

Workflow:

1. Fetch latest remote references.
2. Create temporary worktree.
3. Checkout MR branch.
4. Execute AI review.
5. Generate report.
6. Remove temporary worktree.

---

# Technology Stack

Core Runtime:

- Node.js
- TypeScript (preferred)

Execution Environment:

- WSL2

AI Engine:

- Antigravity CLI (agy), model: gemini-3.1-pro

Persistence:

- SQLite

Email Integration:

- Gmail Filters
- Google Apps Script

Version Control:

- Git
- Git Worktree

GitLab Integration:

- glab CLI (pre-installed in WSL2 with read permissions)

Notifications:

- Telegram Bot API (optional)

---

# Configuration Example

```json
{
  "repositories": {
    "my-project": {
      "projectId": 123,
      "localPath": "/home/user/Workspace/SourceCode/my-project"
    },
    "another-repo": {
      "projectId": 456,
      "localPath": "/home/user/Workspace/SourceCode/another-repo"
    }
  }
}
```

---

# Review Output

The system classifies each MR as one of three types and tailors the review accordingly.

**MR Type Classification:**

- **Feature** — introduces new functionality or capability.
- **Bug Fix** — resolves an existing defect or regression.
- **Unit Test** — adds or modifies test coverage without changing production logic.

---

**Sections common to all MR types:**

1. MR Type Classification
2. Executive Summary
3. Key Changes
4. Potential Bugs
5. Security Concerns
6. Performance Concerns
7. Review Questions

---

**Additional sections for Feature MRs:**

- Design & Architecture Notes
- API or Contract Changes
- Missing Test Scenarios

---

**Additional sections for Bug Fix MRs:**

- Root Cause Assessment
- Fix Correctness
- Regression Risk
- Missing Test Coverage

---

**Additional sections for Unit Test MRs:**

- Coverage Assessment
- Test Quality & Assertions
- Missing Scenarios
- Test Maintainability

---

Reports should prioritize correctness over style.

---

# Future Enhancements

Phase 2:

- Telegram notifications.
- HTML report generation.
- Slack or Discord notifications.

Phase 3:

- Web dashboard.
- Trend analysis across reviews.
- Review caching.
- Incremental reviews for updated MRs.
- Reviewer assignment prioritization.
