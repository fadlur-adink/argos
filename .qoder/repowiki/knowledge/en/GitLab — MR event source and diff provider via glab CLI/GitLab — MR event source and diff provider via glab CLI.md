---
kind: external_dependency
name: GitLab — MR event source and diff provider via glab CLI
slug: gitlab
category: external_dependency
category_hints:
    - vendor_identity
    - client_constraint
scope:
    - '**'
source_files:
    - src/gitlab.ts
---

### Identity & role
- GitLab is the upstream SCM hosting Merge Requests; this agent never calls the GitLab REST API directly.
- All GitLab interaction goes through the `glab` CLI (`glab auth status`, `glab mr view`, `glab mr diff`) executed from within a local clone of the target repo.

### Integration shape
- Authentication is delegated to `glab auth login`; startup verifies at least one host is authenticated by parsing stdout for "Logged in to" / "Token found".
- MR metadata is fetched via `glab mr view <id> -F json` (JSON output parsed into `GitLabMRDetails`).
- Diffs are fetched via `glab mr diff <id>` with a 10 MB child-process buffer cap.
- Both calls are wrapped in exponential-backoff retry (`withRetry`, default 3 attempts).

### Stable constraints
- Requires `glab` installed and pre-authenticated on PATH; no token/URL config lives in this repo.
- Uses the GitLab merge-request notification email format as the canonical event trigger (subject/body pattern defined in README).