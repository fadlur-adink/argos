---
kind: external_dependency
name: Antigravity CLI (agy) — AI review engine invoked as a subprocess
slug: antigravity-cli-agy
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
    - framework_behavior
scope:
    - '**'
source_files:
    - src/engine.ts
---

### Identity & role
- `agy` (Antigravity CLI, https://antigravity.dev) is the external AI agent that performs the actual code review; it invokes the `gemini-3.8-flash-high` model.
- This repo does not call an LLM SDK directly — it spawns `agy` as a child process.

### Invocation contract (stable shape)
- Required flags:
  - `--model gemini-3.8-flash-high`
  - `--dangerously-skip-permissions` (auto-approves file/command tool-use in non-interactive mode)
  - `--add-dir <repo-path>` (grants the agent filesystem access to the target repo so it can read `AGENTS.md`, `.agents/`, `graphify-out/` on demand)
  - `--print-timeout 20m` (must be kept in sync with the outer watchdog `TIMEOUT_MS = 20 * 60 * 1000`)
  - `--print <prompt-content>` (prompt written to a temp file first to bypass command-line length limits)
- Stdio: stdout piped for markdown capture, stderr inherited, stdin ignored.
- On timeout the child is killed with `SIGTERM`; on non-zero exit the full stderr is surfaced.
- Calls are retried up to 2 times with 2s backoff via `withRetry`.

### Diff handling
- Diffs > 100K characters are truncated before being passed to agy.