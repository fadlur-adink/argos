---
kind: external_dependency
name: Telegram Bot API — optional completion notification channel
slug: telegram-bot-api
category: external_dependency
category_hints:
    - vendor_identity
    - sdk_real_api
scope:
    - '**'
source_files:
    - src/telegram.ts
---

### Identity & role
- Optional post-review notification channel using the Telegram Bot API over HTTPS.
- Configured via `config.telegram.botToken` and `config.telegram.chatId`.

### Integration shape
- Direct HTTP `POST` to `https://api.telegram.org/bot${botToken}/sendMessage` using Node.js native `fetch` (no Telegram SDK dependency).
- Message body is sent as Markdown text; failures are logged but do not fail the review pipeline.