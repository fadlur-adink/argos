---
kind: configuration_system
name: JSON + Zod Runtime Configuration System
category: configuration_system
scope:
    - '**'
source_files:
    - src/config.ts
    - config/config.example.json
    - src/logger.ts
    - src/notifier.ts
---

## Approach

The Argos review service uses a **single-file JSON configuration** loaded at process startup, validated with **Zod schemas**, and supplemented by a small number of **process.env** variables for runtime tuning. There is no `.env` file loader (dotenv), no YAML/TOML support, and no feature-flag framework.

## Key Files

- `config/config.example.json` — template showing the expected shape; copied to `config/config.json` per deployment.
- `src/config.ts` — schema definitions (`ConfigSchema`, `RepositoryConfigSchema`, `EmailConfigSchema`) and the `loadConfig()` loader.
- `src/logger.ts` — reads `LOG_LEVEL` from `process.env`.
- `src/notifier.ts` — reads `NOTIF_LOGO_PATH` from `process.env`.

## Architecture

1. **File location**: The loader hard-codes the config path as `path.join(__dirname, "..", "config", "config.json")` relative to the compiled JS output, so the file must live at `<build-root>/config/config.json`.
2. **Loading flow** (`loadConfig()`):
   - Logs the resolved path via `logger.info`.
   - Throws if `config/config.json` does not exist, with an error message instructing users to copy `config/config.example.json`.
   - Reads and parses the JSON via `fs-extra.readJson`.
   - Validates against `ConfigSchema` using `safeParse`; on failure logs the Zod error and throws.
   - Performs a second-level validation: iterates every entry in `config.repositories` and asserts that each `localPath` exists on disk via `fs.pathExists`; missing paths cause an immediate throw.
   - Returns the fully typed `Config` object.
3. **Schema design**:
   - `port` defaults to `8000`.
   - `publicUrl` defaults to `http://localhost:8000`.
   - `repositories` is a record keyed by arbitrary repo name, each value requiring a numeric `projectId` and a non-empty `localPath` string.
   - `telegram.botToken` / `telegram.chatId` are optional strings (or empty string).
   - `email` is optional and requires `host`, positive-int `port`, boolean `secure`, nested `auth.user`/`auth.pass`, a valid email `from`, and a non-empty array of valid emails `to`.
4. **Environment variable overlay**: Only two env vars are consumed directly:
   - `LOG_LEVEL` (default `'info'`) in `src/logger.ts`.
   - `NOTIF_LOGO_PATH` (default `''`) in `src/notifier.ts`.
   These are not part of the main `Config` type and are read inline where needed rather than merged into the config object.

## Conventions and Constraints

- **Single source of truth**: All application settings live in one JSON file under `config/`. There is no layered precedence (no `.env` → JSON merge, no CLI overrides).
- **Template-first deployment**: New installations start from `config/config.example.json` and rename it to `config/config.json`; the loader enforces this by throwing when the file is absent.
- **Runtime validation**: Every config value is validated at load time via Zod; invalid JSON or schema violations abort startup rather than propagating malformed data.
- **Disk-path invariant**: Every configured repository's `localPath` is asserted to exist before `loadConfig()` returns; services can assume these directories are present.
- **Secrets in JSON**: Telegram bot tokens, chat IDs, and SMTP credentials are stored as plain values inside `config/config.json` — there is no secret manager integration or encryption layer observed.
- **Optional integrations**: `telegram` and `email` blocks are optional in the schema, allowing deployments that only need GitLab webhook processing without notifications.
- **Typed exports**: Consumers import the `Config` and `RepositoryConfig` TypeScript types exported from `src/config.ts`, ensuring compile-time alignment between schema and usage.