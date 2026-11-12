---
kind: build_system
name: pnpm Workspace with ts-node Runtime and No Formal Build/CI Pipeline
category: build_system
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - tsconfig.json
    - scripts/test-webhook.sh
    - scripts/google-apps-script.js
    - config/config.example.json
---

# Build System

## What system/approach is used

The repository uses a minimal Node.js build setup:
- **Package manager**: pnpm (workspace root declares `pnpm-workspace.yaml`), with both `package-lock.json` and `pnpm-lock.yaml` present.
- **Runtime / compilation**: TypeScript source under `src/` is executed directly via `ts-node` — there is no separate compile step. The root `package.json` defines `start: "ts-node src/index.ts"`.
- **Workspace configuration**: `pnpm-workspace.yaml` only enables native builds for the `sqlite3` package (`allowBuilds: sqlite3: true`); no workspace packages are declared, so this is effectively a single-package project using pnpm as the lockfile manager.
- **No formal build pipeline**: There is no `Makefile`, no `Dockerfile`, no `docker-compose.yml`, no `.github/workflows`, no `.gitlab-ci.yml`, no `Jenkinsfile`, and no `build.sh`/`deploy.sh`/`release.sh` at the repository root.

## Key files and packages

- `package.json` — root manifest declaring dependencies (`express`, `pino`, `sqlite`, `sqlite3`, `nodemailer`, `zod`, `fs-extra`) and devDependencies (`typescript`, `ts-node`, `@types/*`, `pino-pretty`).
- `pnpm-workspace.yaml` — workspace config enabling native `sqlite3` builds.
- `tsconfig.json` — TypeScript compiler options for the service.
- `scripts/test-webhook.sh` — curl-based smoke test against `http://localhost:8000/webhook` to validate the webhook endpoint locally.
- `scripts/google-apps-script.js` — Google Apps Script that forwards Gmail-labeled GitLab MR notifications to the Argos webhook; it expects HTTP 202 from the server and treats 422/400 as "consume and mark read".
- `config/config.example.json` / `config/config.json` — runtime configuration consumed by the service (not build-time).

## Architecture and conventions

- **Single-process runtime**: The service is started with `pnpm start` (or `ts-node src/index.ts`) and runs in-place from the TypeScript sources. There is no transpiled output directory, no bundler, and no artifact produced for deployment.
- **Native addon support**: `sqlite3` is a native Node addon; `pnpm-workspace.yaml` explicitly allows its build, indicating the expectation that `node-gyp`/Python toolchain is available on the host where the agent runs.
- **Deployment model implied by scripts**: The Google Apps Script bridge and the shell webhook test imply the service is expected to be reachable over plain HTTP (`WEBHOOK_URL = 'http://YOUR_SERVER_IP:8000/webhook'`), not behind a reverse proxy or containerized entrypoint defined in this repo.
- **Test strategy**: The root `test` script is a placeholder (`echo "Error: no test specified" && exit 1`). Tests live inside the cloned worktree under `state/worktrees/<repo>/...` (e.g., Jest configs like `jest.config.ts`, `eslint.config.mjs`, `sonar-project.properties`), but those belong to the target application being reviewed, not to Argos itself.

## Conventions and constraints

- **No CI/CD configuration exists in this repository.** A search across the root tree finds no GitHub Actions, GitLab CI, Jenkinsfile, Makefile, Dockerfile, or release automation. Any CI/CD would have to be added externally or lives outside this repo.
- **No packaging/release artifacts are produced.** There is no `dist/`, no npm publish script, no version bump script, and no changelog generator. The `version` field in `package.json` is hardcoded to `1.0.0`.
- **Development workflow**: Install dependencies with pnpm, then run `pnpm start`. The provided `scripts/test-webhook.sh` demonstrates how to exercise the webhook endpoint locally with a sample GitLab MR payload.
- **Dependency management constraint**: Native modules require a build-capable environment; `pnpm-workspace.yaml` explicitly whitelists `sqlite3` for native builds, which is the only such allowance in the workspace config.