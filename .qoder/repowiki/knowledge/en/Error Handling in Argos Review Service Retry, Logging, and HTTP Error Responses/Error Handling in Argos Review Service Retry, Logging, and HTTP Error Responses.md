---
kind: error_handling
name: 'Error Handling in Argos Review Service: Retry, Logging, and HTTP Error Responses'
category: error_handling
scope:
    - '**'
source_files:
    - src/logger.ts
    - src/retry.ts
    - src/server.ts
    - src/queue.ts
    - src/engine.ts
    - src/parser.ts
---

## Overview

The Argos review service is a small Node.js/Express application with no dedicated error-type library or custom error hierarchy. Errors are handled through three complementary mechanisms:

1. **Structured logging** via `pino` (see `src/logger.ts`).
2. **Exponential-backoff retry wrapper** for transient failures (`src/retry.ts`).
3. **Per-route try/catch blocks** that log and return JSON error responses from Express handlers (`src/server.ts`).
4. **Silent failure + continuation** in the background event queue (`src/queue.ts`).

There are no sentinel error constants, no `Error` subclass hierarchy, no global Express error middleware, and no `panic`/`recover`-style constructs (this is JavaScript/TypeScript).

## Key Files and Packages

| File | Role |
|---|---|
| `src/logger.ts` | Centralized `pino` logger instance; level controlled by `LOG_LEVEL` env var; uses `pino-pretty` transport with colorization and timestamp translation. |
| `src/retry.ts` | Exports `withRetry<T>(fn, maxRetries, baseDelayMs, context)` — wraps an async function with exponential backoff (`baseDelayMs * 2^(attempt-1)`) and rethrows after exhaustion. |
| `src/server.ts` | Express app; every route handler wraps its body in `try/catch`, logs via `logger.error(...)`, and returns a JSON `{ error }` response with an appropriate status code (400, 404, 422, 500). |
| `src/queue.ts` | In-process `EventQueue` class; `processNext()` catches all errors from the processor, logs them, and continues processing subsequent items (no retry on queue-level failures). |
| `src/engine.ts` | Orchestrates the external `agy` CLI; converts child process exit codes and timeouts into thrown `Error`s, then wraps the whole invocation in `withRetry(..., 2, 2000, ...)` for two retries before bubbling up. |
| `src/parser.ts` | Returns `null` instead of throwing when it cannot parse a GitLab email payload; callers check for null and respond with 422. |

## Architecture and Conventions

### HTTP error responses
All Express routes in `server.ts` follow the same shape:

```ts
try {
  // handler logic
} catch (err: any) {
  logger.error(`Error ...: ${err.message}`);
  res.status(500).json({ error: 'Internal server error' });
}
```

Validation failures return specific codes:
- `400` for invalid parameters (`parseInt` produces `NaN`).
- `404` for missing reviews or missing markdown files.
- `422` for unprocessable/unrecognized webhook payloads or unconfigured projects.
- `202` for accepted webhooks (async enqueue).
- `500` as the generic catch-all for unexpected exceptions.

No global error-handling middleware is registered; each route handles its own errors.

### Retry strategy
`withRetry` in `src/retry.ts` is the single retry primitive used by the codebase. It:
- Catches any thrown value from `fn()`.
- Logs a warning with the attempt number and delay.
- Sleeps for `baseDelayMs * Math.pow(2, attempt - 1)` milliseconds between attempts.
- Rethrows the original error after `maxRetries` are exhausted.

It is consumed only by `engine.ts` around the `agy` CLI invocation (2 retries, 2-second base delay, context string `agy CLI generation for MR !${mrId}`). No other module uses it.

### Background job error swallowing
`EventQueue.processNext()` has a `try/catch` that logs the error but does **not** rethrow or retry. The `finally` block resets `isProcessing` and schedules the next item, so one failing event does not poison the queue. This is a deliberate design choice: transient processor failures are logged and skipped rather than blocking the pipeline.

### Parser returns `null` instead of throwing
`parseGitLabEmail` returns `MergeRequestEvent | null`. Callers in `server.ts` explicitly test for `null` and respond with 422. There is no custom error type representing "unrecognized event".

### External process error mapping
`engine.ts` maps `child_process` outcomes to thrown `Error`s:
- Spawn error → rejects with the spawn error.
- Timeout (20-minute limit) → rejects with `Error('agy timed out after ...')`.
- Non-zero exit code → rejects with `Error('agy exited with code N: <stderr>')`.
- Success → resolves with stdout.

The outer `try/catch` in `generateReview` logs the failure and re-throws a wrapped `Error('AI Review Generation failed: ...')` so callers get a uniform surface.

### Logging conventions
All error paths go through the shared `logger`:
- `logger.error` for failures (HTTP errors, CLI failures, queue processor errors, retry exhaustion).
- `logger.warn` for non-fatal conditions (missing webhook fields, unrecognized events, unconfigured projects, prompt file cleanup failures).
- `logger.info` for normal flow (server start, enqueuing, successful processing).
- `logger.debug` for diagnostic data (prompt file path, agy stderr/stdout when available).

Log levels are configured at startup via the `LOG_LEVEL` environment variable, defaulting to `info`.

## Conventions and Constraints

- **No custom error types**: The codebase does not define any `Error` subclasses or sentinel values (e.g., no `NotFoundError`, `ValidationError`). Errors are plain `Error` instances constructed inline with message strings.
- **No global Express error middleware**: Each route handler owns its `try/catch`; there is no centralized error formatter or `app.use((err, req, res, next) => ...)` handler.
- **Parser functions return `null` on parse failure** rather than throwing, making callers responsible for null checks (`parseGitLabEmail` is the primary example).
- **Background work swallows errors silently after logging**: `EventQueue` never rethrows or retries failed items; it just logs and advances to the next queued event.
- **Transient I/O/external calls use `withRetry`**: Only the `agy` CLI invocation uses the retry wrapper, with 2 retries and a 2-second base delay.
- **All user-visible API errors are JSON objects with an `error` field**: Every HTTP error response follows the shape `{ error: string }`.
- **Logging is mandatory on error paths**: Every `catch` block calls `logger.error` before returning a response or continuing; there are no silent `catch` blocks without logging.
- **Child process errors are normalized**: `engine.ts` converts raw `child_process` errors and exit codes into typed `Error` messages before they propagate outward.