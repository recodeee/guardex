# Plain gx cockpit welcome

## Why

Plain interactive `gx` should open the GitGuardex cockpit welcome/control view. Operators currently need to remember `gx cockpit` or get the old status/launcher behavior, which makes the cockpit feel secondary even though it is now the primary dmux-style surface.

## What Changes

- Route no-argument interactive `gx` to the cockpit control launcher.
- Prefer Kitty when remote control is available, then fall back to tmux, then fall back to an inline cockpit render.
- Preserve non-interactive no-argument status output and explicit `gx status`.
- Add `GUARDEX_LEGACY_STATUS=1` to force no-argument `gx` back to status output.

## Impact

The change is limited to no-argument CLI dispatch and cockpit launch helpers. It does not alter explicit `gx cockpit`, `gx status`, agent branch creation, locks, or finish behavior.
