---
kind: logging_system
name: Pino-based Structured Logging with Pretty Transport
category: logging_system
scope:
    - '**'
source_files:
    - src/logger.ts
---

## Overview

The Argos review service uses **Pino** (`pino`) as its sole logging framework, configured once at application bootstrap and exported as a singleton `logger` instance consumed by every module.

## Core Implementation

- **Logger factory**: `src/logger.ts` creates a single Pino logger with:
  - Level sourced from `process.env.LOG_LEVEL`, defaulting to `'info'`.
  - A `pino-pretty` transport that colorizes output, translates timestamps using the `SYS:standard` format, and suppresses `pid`/`hostname` fields from console output.
- No additional transports (file, syslog, remote) are configured — all logs go to stdout via the pretty transport.

## Usage Pattern Across Modules

Every domain module (`config.ts`, `db.ts`, `email.ts`, `git.ts`, `gitlab.ts`, `engine.ts`, `server.ts`, `notifier.ts`, `telegram.ts`, `queue.ts`, `retry.ts`, `parser.ts`, `index.ts`) imports the shared `logger` from `./logger` and calls it directly:

```ts
import { logger } from './logger';
```

Observed log levels in use:
- `logger.info(...)` — lifecycle events (DB init, config load, worktree creation/removal, email sent).
- `logger.error(...)` — failure paths (config parse errors, DB init failures, Git worktree failures, email send failures).
- `logger.debug(...)` — conditional skips (e.g., when email recipients are missing or not configured).
- `warn`, `fatal`, `trace` are not used anywhere in `src/`.

Log messages are plain interpolated strings; no structured log objects (key-value pairs) are passed to the logger methods. The only structured data emitted is Pino's built-in fields (`time`, `level`, `msg`) plus the suppressed `pid`/`hostname`.

## Configuration

- Runtime level is controlled exclusively via the `LOG_LEVEL` environment variable.
- There is no per-module or per-namespace log-level configuration.
- The `pino-pretty` options are fixed in code (colorize on, time translation, pid/hostname ignored); there is no runtime override for transport behavior.

## Conventions Observed

1. **Single logger instance**: All modules import the same `logger` singleton from `src/logger.ts`; no module creates its own Pino instance.
2. **String-interpolated messages**: Log payloads are template literals embedding contextual values (paths, IDs, error messages), not structured objects.
3. **Level discipline**: `info` for normal progress, `error` for exceptions/failures, `debug` for optional/skippable diagnostics.
4. **No log rotation or file sinks**: Output is intended for stdout consumption by an external process manager / container orchestrator.
5. **No request-scoped context**: There is no correlation ID, user ID, or request context attached to log lines.

## Constraints Enforced by Code

- The log level defaults to `info` when `LOG_LEVEL` is unset — this is enforced by the Pino constructor in `src/logger.ts`.
- The pretty transport is always active; there is no conditional branch to disable it based on environment.