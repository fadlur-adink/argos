---
kind: external_dependency
name: Google Apps Script — Gmail → Argos webhook bridge
slug: google-apps-script
category: external_dependency
category_hints:
    - vendor_identity
    - auth_protocol
scope:
    - '**'
source_files:
    - scripts/google-apps-script.js
    - docs/Google_Apps_Script_Setup.md
---

### Identity & role
- A Google Apps Script deployed to a user's Google account forwards GitLab MR notification emails received in Gmail to Argos' `/webhook` endpoint.
- This is the only path into the pipeline; the agent has no direct GitLab webhook integration.

### Integration shape
- The script POSTs a JSON payload `{ subject, body }` to the configured public URL.
- The webhook expects the subject to match the GitLab notification pattern `Group/Project | MR Title (!123)` and the body to contain a GitLab MR URL.
- No authentication header is used between the two sides; security relies on the private URL + Gmail filter routing.