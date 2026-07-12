## Context

The session tab close button currently calls `_closeSession(session.id)` directly without any confirmation. The fix adds a simple `confirm()` dialog before closing.

## Goals / Non-Goals

**Goals:**
- Show a browser confirm dialog when clicking the tab close button
- Include the session identifier (username@hostname:port) in the message

**Non-Goals:**
- Custom modal/styled dialog (using browser native `confirm()`)
- Confirmation for the "Disconnect all" or other close paths

## Decisions

**Approach:** Add a `confirm()` call in the tab close button click handler at `client/public/app.js:549-552`, using `session.username@session.hostname:session.port` as the session identifier in the message text.

## Risks / Trade-offs

- Native `confirm()` is simple but unstyled — acceptable for this use case
