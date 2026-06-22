# AI Reviewer Agent

A personal, self-hosted AI code review assistant that automatically generates structured review reports for GitLab Merge Requests — without requiring GitLab webhook permissions or modifying the target repository.

## How It Works

```
GitLab MR Notification Email
        ↓
  Gmail Filter  →  Google Apps Script (HTTP POST)
        ↓
  AI Reviewer Agent (Express HTTP Server)
        ↓
  ┌──────────────────────────────────────────┐
  │  1. Parse email → extract MR metadata    │
  │  2. Deduplicate via SQLite               │
  │  3. Create isolated Git worktree         │
  │  4. Fetch MR diff via glab CLI           │
  │  5. Generate AI review via agy CLI       │
  │     (agent reads repo context on its own │
  │      via --add-dir and tool use)         │
  │  6. Save Markdown report                 │
  │  7. Notify (Telegram / Email / Desktop)  │
  └──────────────────────────────────────────┘
        ↓
  Web Dashboard (http://localhost:8000)
  Browse and read review reports from the browser
```

The agent monitors GitLab merge request notifications delivered through email (forwarded by a Google Apps Script), runs an AI-powered code review using [Antigravity CLI (`agy`)](https://antigravity.dev) with `gemini-3.1-pro`, and produces a private Markdown report. It never posts comments or approvals back to GitLab.

## Features

- **Email-driven trigger** — works within existing permission boundaries; no GitLab webhooks needed
- **Multi-repository support** — configure multiple local repos, each routed automatically
- **Agentic context loading** — the `agy` agent reads `AGENTS.md`, `.agents/`, and `graphify-out/` directly from the repository using its own file-reading tools (via `--add-dir`), keeping prompts lean and letting the agent fetch exactly what it needs
- **MR type classification** — automatically classifies MRs as Feature, Bug Fix, or Unit Test and tailors report sections
- **Git worktree isolation** — reviews run in temporary worktrees; your active branch is never touched
- **Deduplication** — SQLite tracks reviewed (project, MR, commit SHA) tuples to avoid re-reviews
- **Web Dashboard** — a built-in web UI to browse and read review reports from your browser, with auto-refresh and deep-link support
- **Windows Desktop Notifications** — clickable Windows toast notifications (via BurntToast PowerShell module) that open the specific review in your browser when clicked; works from within WSL
- **Notifications** — optional Telegram Bot and SMTP email notifications on review completion
- **Retry with backoff** — glab CLI and agy CLI calls are retried with exponential backoff
- **Graceful cleanup** — orphaned worktrees are pruned on startup and after each review

## Prerequisites

| Dependency | Purpose |
|---|---|
| **Node.js ≥ 18** | Runtime (uses native `fetch`) |
| **TypeScript** | Source language |
| **[glab CLI](https://gitlab.com/gitlab-org/cli)** | Fetch MR details and diffs (must be authenticated via `glab auth login`) |
| **[agy CLI](https://antigravity.dev)** | Antigravity CLI — invokes `gemini-3.1-pro` for AI reviews |
| **Git** | Worktree management |
| **Gmail + Google Apps Script** | Email forwarding bridge (see [setup guide](docs/Google_Apps_Script_Setup.md)) |
| **BurntToast** (optional) | PowerShell module for Windows desktop notifications (`Install-Module BurntToast` in PowerShell) |

## Quick Start

### 1. Clone & install dependencies

```bash
git clone <repo-url> ai-reviewer-agent
cd ai-reviewer-agent
npm install
```

### 2. Configure

Copy the example config and edit it:

```bash
cp config/config.example.json config/config.json
```

Edit `config/config.json`:

```jsonc
{
  "port": 8000,                           // HTTP server port (default: 8000)
  "publicUrl": "https://ai-reviewer.example.com",  // Public URL for notification deep-links (default: http://localhost:8000)
  "repositories": {
    "my-project": {                       // project name as it appears in GitLab URLs
      "projectId": 123,                   // GitLab project ID
      "localPath": "/path/to/local/clone"
    }
  },
  "telegram": {                           // optional
    "botToken": "your-bot-token",
    "chatId": "your-chat-id"
  },
  "email": {                              // optional
    "host": "smtp.example.com",
    "port": 587,
    "secure": false,
    "auth": {
      "user": "user@example.com",
      "pass": "password"
    },
    "from": "ai-reviewer@example.com",
    "to": ["developer@example.com"]
  }
}
```

### 3. Authenticate glab CLI

```bash
glab auth login
```

### 4. Set up the Google Apps Script email bridge

Follow the [Google Apps Script Setup Guide](docs/Google_Apps_Script_Setup.md) to forward Gmail notifications to this agent.

### 5. (Optional) Install BurntToast for Windows notifications

In a PowerShell window (on Windows or WSL):

```powershell
Install-Module BurntToast -Force
```

### 6. Start the agent

```bash
npm start
```

The server listens on the configured port (default `8000`). Open `http://localhost:8000` in your browser to access the review dashboard.

## Web Dashboard

The built-in web UI is served at the root URL (`/`) and provides:

- **Review List** — a sidebar listing all reviewed MRs with their status (Completed, Pending, Failed) and timestamps
- **Markdown Rendering** — click any completed review to view the full report rendered with syntax-highlighted code blocks
- **Deep Linking** — each review has a unique URL (`/?id=42`) that can be shared or opened directly from desktop notifications
- **Auto-Refresh** — the review list refreshes every 10 seconds to show newly completed reviews

## API Endpoints

| Method | Path | Description |
|---|---|---|
| `GET` | `/` | Web Dashboard — browse and read review reports |
| `GET` | `/status` | Health check — returns `{ status: "ok", uptime: <seconds> }` |
| `GET` | `/api/reviews` | List all reviews from the database (JSON) |
| `GET` | `/api/reviews/:id` | Get a specific review with its markdown content (JSON) |
| `POST` | `/webhook` | Receives email payloads from Google Apps Script |

### Webhook payload

```json
{
  "subject": "Group/Project | MR Title (!123)",
  "body": "... contains https://gitlab.example.com/group/project/-/merge_requests/123 ..."
}
```

## Project Structure

```
ai-reviewer-agent/
├── config/
│   ├── config.example.json      # Example configuration
│   └── config.json              # Your local configuration (gitignored)
├── docs/
│   ├── AI_Reviewer_Agent_Idea.md
│   ├── AI_Reviewer_Agent_PRD.md
│   └── Google_Apps_Script_Setup.md
├── public/
│   └── index.html               # Web Dashboard (SPA with markdown rendering)
├── scripts/
│   ├── google-apps-script.js    # Gmail → webhook bridge (deploy to Apps Script)
│   └── test-webhook.sh          # Manual webhook testing
├── src/
│   ├── index.ts                 # Bootstrap & main pipeline orchestration
│   ├── server.ts                # Express HTTP server (static files, API, webhook)
│   ├── parser.ts                # GitLab email → MergeRequestEvent parser
│   ├── queue.ts                 # In-memory sequential event queue
│   ├── config.ts                # Zod-validated config loading
│   ├── db.ts                    # SQLite persistence (reviews table)
│   ├── git.ts                   # Git worktree create / remove / cleanup
│   ├── gitlab.ts                # glab CLI wrapper (MR details & diff)
│   ├── engine.ts                # AI review engine (agy CLI invocation)
│   ├── notifier.ts              # Windows desktop notifications (BurntToast via WSL)
│   ├── email.ts                 # SMTP email notifications via nodemailer
│   ├── telegram.ts              # Telegram Bot API notifications
│   ├── retry.ts                 # Generic exponential-backoff retry utility
│   └── logger.ts                # Pino logger with pretty printing
├── state/
│   ├── agent.db                 # SQLite database (auto-created)
│   ├── prompts/                 # Temporary prompt files (auto-cleaned)
│   └── worktrees/               # Temporary Git worktrees (auto-cleaned)
├── reviews/                     # Generated review reports (auto-created)
│   └── <project-name>/
│       └── mr-<id>-<sha>.md
├── Example Email/               # Sample GitLab notification emails for reference
├── package.json
└── tsconfig.json
```

## Source Modules

### `index.ts` — Bootstrap & Pipeline

The main entry point. On startup it:
1. Loads and validates `config/config.json` (via Zod)
2. Initializes the SQLite database
3. Verifies `glab` CLI authentication
4. Cleans up orphaned worktrees from previous crashes
5. Creates an event queue with the review pipeline as the processor
6. Starts the Express HTTP server

The review pipeline for each MR event:
1. Fetches MR details and checks for duplicates
2. Creates an isolated Git worktree
3. Fetches the MR diff
4. Invokes the agy CLI with `--add-dir <repo-path>` to run an agentic AI review
5. Saves the markdown report and updates the database
6. Sends notifications (Telegram, Email, Desktop)

### `engine.ts` — AI Review Engine

Constructs a review prompt containing MR metadata and the diff, then invokes the Antigravity CLI (`agy`) as a full AI agent. The agent is given access to the target repository via `--add-dir` and instructed to read `AGENTS.md`, `.agents/`, and `graphify-out/` using its own file-reading tools. This keeps the prompt lean and allows the agent to pull in exactly the context it needs.

Key flags:
- `--dangerously-skip-permissions` — auto-approves tool-use requests in non-interactive mode
- `--add-dir <repo-path>` — grants the agent file access to the target repository
- `--print-timeout 10m` — extended timeout for complex agentic reviews (file browsing, test running, etc.)

Large diffs (>100K chars) are truncated. The CLI call is retried up to 2 times with exponential backoff.

### `notifier.ts` — Windows Desktop Notifications

Sends clickable Windows toast notifications from within WSL using the BurntToast PowerShell module. Notifications include a custom logo image and, when clicked, open the Web Dashboard directly to the specific review report. Uses `execFile('powershell.exe', ...)` to avoid shell escaping issues.

### `server.ts` — HTTP Server & Web Dashboard

Serves the static Web Dashboard from `public/`, exposes REST API endpoints for fetching review data (`/api/reviews`, `/api/reviews/:id`), and handles incoming webhook payloads from the Google Apps Script email bridge.

### `parser.ts` — Email Parser

Parses GitLab notification emails to extract `MergeRequestEvent` objects. Handles percent-encoded URLs (e.g., FireEye-wrapped links) and extracts project name, MR ID, title, URL, and action (`opened`, `updated`, `approved`, `merged`, `commented`).

### `db.ts` — SQLite Persistence

Manages the `reviews` table with columns for project name, MR ID, commit SHA, status (`PENDING` / `COMPLETED` / `FAILED`), and report path. A unique index on `(project_name, mr_id, commit_sha)` enforces deduplication. Provides query functions for the Web Dashboard API.

### `git.ts` — Worktree Manager

Creates isolated Git worktrees by fetching `refs/merge-requests/<id>/head` and checking out a detached HEAD. Handles cleanup on success, failure, and startup (orphan detection).

### `gitlab.ts` — GitLab CLI Wrapper

Wraps `glab mr view` and `glab mr diff` commands with retry logic to fetch MR metadata and diffs.

### `queue.ts` — Event Queue

A simple in-memory FIFO queue that processes `MergeRequestEvent` items sequentially (one at a time), preventing concurrent reviews from interfering with each other.

## Review Report Output

Reports are saved as Markdown files under `reviews/<project-name>/mr-<id>-<sha>.md` and can be viewed directly in the Web Dashboard.

Each report is classified into one of three MR types, with type-specific sections:

| Common Sections | Feature | Bug Fix | Unit Test |
|---|---|---|---|
| MR Type Classification | ✓ | ✓ | ✓ |
| Executive Summary | ✓ | ✓ | ✓ |
| Key Changes | ✓ | ✓ | ✓ |
| Potential Bugs | ✓ | ✓ | ✓ |
| Security Concerns | ✓ | ✓ | ✓ |
| Performance Concerns | ✓ | ✓ | ✓ |
| Review Questions | ✓ | ✓ | ✓ |
| Design & Architecture Notes | ✓ | | |
| API or Contract Changes | ✓ | | |
| Missing Test Scenarios | ✓ | | |
| Root Cause Assessment | | ✓ | |
| Fix Correctness | | ✓ | |
| Regression Risk | | ✓ | |
| Missing Test Coverage | | ✓ | |
| Coverage Assessment | | | ✓ |
| Test Quality & Assertions | | | ✓ |
| Missing Scenarios | | | ✓ |
| Test Maintainability | | | ✓ |

## Testing

Use the included test script to send sample webhook payloads:

```bash
bash scripts/test-webhook.sh
```

## Environment Variables

| Variable | Default | Description |
|---|---|---|
| `LOG_LEVEL` | `info` | Pino log level (`debug`, `info`, `warn`, `error`, `fatal`) |

## Design Decisions

- **No GitLab writes** — the agent is read-only by design; it never posts comments, approvals, or modifies MRs
- **Email as event source** — works around the lack of webhook permissions by leveraging existing email notifications
- **glab CLI over API** — reuses the pre-authenticated `glab` CLI rather than managing tokens directly
- **agy CLI for AI** — delegates AI model invocation to the Antigravity CLI, keeping the agent model-agnostic
- **Agentic context loading** — instead of injecting repository context (AGENTS.md, rules, graphs) directly into the prompt, the agent is given filesystem access via `--add-dir` and reads context on demand using its tools. This keeps prompts small and lets the agent decide what context is relevant
- **Git worktrees** — ensures the developer's active checkout is never disturbed during reviews
- **Sequential processing** — the in-memory queue processes one MR at a time to avoid resource contention
- **WSL-native notifications** — uses PowerShell's BurntToast module called from WSL via `execFile` to deliver clickable Windows toast notifications without requiring any Windows-side setup beyond the module

## Documentation

- [Project Idea](docs/AI_Reviewer_Agent_Idea.md) — original concept and motivation
- [Product Requirements (PRD)](docs/AI_Reviewer_Agent_PRD.md) — full functional and non-functional requirements
- [Google Apps Script Setup](docs/Google_Apps_Script_Setup.md) — step-by-step email bridge configuration

## License

ISC
