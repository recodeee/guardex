## Why

- Users requested one canonical HTTPS tutorial URL to be visible in both places they discover GuardeX:
  the frontend "How it works" about/header area and npm package metadata.
- Keeping these surfaces aligned reduces confusion between GitHub README links and the public tutorial site.

## What Changes

- Update frontend header copy in `frontend/app/page.tsx` to include a clickable
  `https://guardextutorial.com` link in the GuardeX brand subtitle.
- Update npm package metadata in root `package.json` so `homepage` points to
  `https://guardextutorial.com` (the URL shown on npm package pages).

## Impact

- Affected surfaces: local frontend landing page and npm package metadata.
- Risk is low and isolated to display metadata/copy.
- npmjs.com homepage card updates only after publishing a new package version.
