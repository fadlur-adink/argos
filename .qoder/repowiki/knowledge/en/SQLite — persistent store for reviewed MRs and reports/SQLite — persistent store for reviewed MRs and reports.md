---
kind: external_dependency
name: SQLite — persistent store for reviewed MRs and reports
slug: sqlite
category: external_dependency
category_hints:
    - vendor_identity
scope:
    - '**'
source_files:
    - package.json
    - README.md
---

### Identity & role
- Embedded SQLite database (`state/agent.db`) stores the `reviews` table used for deduplication and the web dashboard.
- Columns: project name, MR ID, commit SHA, status (`PENDING` / `COMPLETED` / `FAILED`), report path.
- Unique index on `(project_name, mr_id, commit_sha)` enforces per-MR deduplication.

### Integration shape
- Two runtime dependencies declared: `sqlite` (JS driver) and `sqlite3` (native bindings).
- Database path is under `state/agent.db`; auto-created on first use.