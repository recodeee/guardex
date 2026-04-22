# GitGuardex Active Agents

Local VS Code companion for Guardex-managed repos.

What it does:

- Adds an `Active Agents` view to the Source Control container.
- Renders one repo node per live Guardex workspace with grouped `ACTIVE AGENTS` and `CHANGES` sections.
- Splits live sessions inside `ACTIVE AGENTS` into `WORKING NOW` and `THINKING` groups so active edit lanes stand out immediately.
- Shows one row per live Guardex sandbox session inside those activity groups.
- Shows repo-root git changes in a sibling `CHANGES` section when the guarded repo itself is dirty.
- Derives `thinking` versus `working` from the live sandbox worktree, surfaces working counts in the repo/header summary, and shows changed-file counts for active edits.
- Uses VS Code's native animated `loading~spin` icon for the running-state affordance.
- Reads repo-local presence files from `.omx/state/active-sessions/`.

Install from a Guardex-wired repo:

```sh
node scripts/install-vscode-active-agents-extension.js
```

Then reload the VS Code window.
