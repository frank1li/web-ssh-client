## Why

The session tab close button currently closes the session immediately without any confirmation. Users can accidentally disconnect an active session with a single mis-click.

## What Changes

- Add a `confirm()` dialog when the user clicks the tab close button, showing the session name and asking for confirmation before closing

## Capabilities

### New Capabilities
- `session-close-confirm`: Confirmation dialog before closing an SSH session tab

### Modified Capabilities
- (none)

## Impact

- **client/public/app.js**: Add `confirm()` check in the tab close button click handler in `_addSessionTab()`
