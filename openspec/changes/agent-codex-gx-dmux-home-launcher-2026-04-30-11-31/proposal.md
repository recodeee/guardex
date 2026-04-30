# gx dmux home launcher task prompt

## Why

Plain `gx` and `gx agents start --panel` should feel like opening dmux first: show the GitGuardex home launcher immediately, then collect the task inside that launcher. The current parser and panel controller require a task before the panel can open, so the operator has to provide text before seeing the home screen.

## What Changes

- Allow `gx agents start --panel` to start without a task when an interactive panel or panel dry-run is requested.
- Put empty-task panels into a task-input mode where printable keys build the task and Enter launches.
- Route plain interactive `gx` to the same home panel instead of status output.
- Preserve existing dry-run, multi-agent, claims, and non-panel start behavior.

## Impact

The change is isolated to agent launcher parsing, panel state handling, and focused CLI tests. It does not alter branch creation, locks, session metadata, finish flow, or non-panel agent startup.
