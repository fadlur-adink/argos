---
kind: dependency_management
name: pnpm Workspace with npm Lockfiles and Native Build Allowlist
category: dependency_management
scope:
    - '**'
source_files:
    - package.json
    - pnpm-workspace.yaml
    - package-lock.json
    - pnpm-lock.yaml
---

## System / Approach

The repository is a **pnpm workspace** (root `pnpm-workspace.yaml`) that bundles the Argos review service, its deployment scripts/configs, and project documentation under a shared TypeScript/Express runtime. Dependencies are declared via standard npm-style `package.json` files and resolved from the public npm registry (`registry.npmjs.org`). Two lockfile formats coexist at the root: `package-lock.json` (npm) and `pnpm-lock.yaml` (pnpm). There is no vendored `node_modules`, no private registry configuration, and no `GOPRIVATE`-style mechanism — this is a pure Node.js dependency surface.

## Key Files

- `package.json` — root manifest declaring runtime dependencies (`express`, `fs-extra`, `nodemailer`, `pino`, `sqlite`, `sqlite3`, `zod`) and dev dependencies (`typescript`, `ts-node`, `@types/*`, `pino-pretty`). The `start` script runs `ts-node src/index.ts`, so the app is executed directly against source without a separate build step.
- `pnpm-workspace.yaml` — declares the workspace and contains an `allowBuilds.sqlite3: true` entry, which is required because `sqlite3` ships native C++ addons that need to be compiled during install.
- `package-lock.json` — npm lockfile pinning exact transitive versions for reproducible installs.
- `pnpm-lock.yaml` — pnpm lockfile pinning the same dependency graph for pnpm users.
- `state/worktrees/<repo>/pnpm-lock.yaml` and `state/worktrees/<repo>/package-lock.json` — per-worktree lockfiles generated when the agent clones target repositories; these are transient artifacts of reviewing external projects, not part of the Argos service itself.

## Architecture and Conventions

- **Single-root package**: All of Argos lives in one top-level `package.json`; there are no `packages/` sub-projects referenced by the workspace config. The `pnpm-workspace.yaml` only contains the `allowBuilds` directive, meaning the workspace has exactly one member (the root).
- **Version ranges use caret (`^`)**: Every dependency in `package.json` uses a caret range (e.g. `express ^5.2.1`, `zod ^4.4.3`, `typescript ^6.0.3`), allowing minor/patch upgrades within the major version. This is a convention observed across both `dependencies` and `devDependencies`.
- **TypeScript-first toolchain**: Types are installed as peer `@types/*` packages alongside their runtime counterparts (`@types/express`, `@types/fs-extra`, `@types/node`, `@types/nodemailer`, `@types/pino`, `@types/sqlite3`), keeping type definitions in sync with runtime packages.
- **Native addon exception**: `sqlite3` requires compilation on install. The workspace explicitly whitelists it via `allowBuilds.sqlite3: true` in `pnpm-workspace.yaml`; without this, pnpm would block the build step.
- **No private registry or scoped packages**: No `.npmrc`, no `@org/` scopes, no `GOOGLE_APPLICATION_CREDENTIALS`-style private auth. All packages resolve from the public npm registry, as evidenced by the `https://registry.npmjs.org/...` URLs in `package-lock.json`.
- **Dual lockfiles**: Both `package-lock.json` and `pnpm-lock.yaml` are committed, suggesting the repo supports installation via either npm or pnpm, though the workspace config is pnpm-specific.
- **Transient worktree deps**: When the agent clones a target repository into `state/worktrees/<name>/`, that clone brings its own `package.json`/lockfiles. These are not managed by the Argos service's dependency system — they are snapshots of reviewed code.

## Constraints and Rules

- `sqlite3` must remain the only package allowed to run native builds; adding another native addon requires an explicit `allowBuilds.<pkg>: true` entry in `pnpm-workspace.yaml` (enforced by pnpm's default behavior).
- Dependency versions are pinned to caret ranges in `package.json`; exact pins live only in the lockfiles (`package-lock.json`, `pnpm-lock.yaml`).
- Type declarations for every runtime dependency are declared as `devDependencies` using the `@types/` scope, matching each runtime package name.