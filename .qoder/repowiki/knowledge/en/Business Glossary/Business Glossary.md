---
kind: business_term
name: Business Glossary
category: business_term
scope:
    - '**'
---

### MR
- Definition：GitLab Merge Request — the unit of change that triggers an automated AI review. Identified by its numeric ID and commit SHA; each unique (project, MR, SHA) tuple is reviewed exactly once.
- Aliases：merge request

### agy
- Definition：The Antigravity CLI (`agy`), an external agentic tool invoked as a subprocess to perform the AI-powered code review against the `gemini-3.8-flash-high` model. It reads repository context files (`AGENTS.md`, `.agents/`, `graphify-out/`) via its own file-reading tools rather than having them injected into the prompt.
- Aliases：antigravity cli、antigravity

### glab
- Definition：The GitLab CLI (`glab`), used exclusively to fetch MR metadata (`mr view`) and diffs (`mr diff`) from a locally cloned repository. Authentication is managed outside this repo via `glab auth login`.
- Aliases：gitlab cli

### worktree isolation
- Definition：The practice of creating a temporary Git worktree per MR review so the agent checks out the MR's exact revision without touching the developer's active branch. Orphaned worktrees are pruned on startup and after each review.
- Aliases：isolated worktree、temporary worktree

### BurntToast
- Definition：Windows PowerShell module used to deliver clickable desktop toast notifications from within WSL, linking back to the specific review report in the Argos dashboard.
- Aliases：burnt toast
