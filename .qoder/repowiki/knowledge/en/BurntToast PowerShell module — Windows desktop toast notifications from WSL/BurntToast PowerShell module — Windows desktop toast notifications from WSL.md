---
kind: external_dependency
name: BurntToast PowerShell module — Windows desktop toast notifications from WSL
slug: burnttoast
category: external_dependency
category_hints:
    - vendor_identity
    - framework_behavior
scope:
    - '**'
source_files:
    - src/notifier.ts
---

### Identity & role
- Optional Windows desktop notification delivery via the `BurntToast` PowerShell module (`Install-Module BurntToast`).
- Used when running Argos inside WSL to show clickable toast notifications that open the review dashboard.

### Integration shape
- Invoked through `powershell.exe -NoProfile -ExecutionPolicy Bypass -Command ...` via `execFile` (avoids shell escaping issues).
- Builds a generic toast binding with title, message, optional logo image, and optional launch URI pointing to the review report.
- Failure is non-fatal: errors are logged but the review pipeline continues.