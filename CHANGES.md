# NPD Planner — Release & Commit Guide for Kimi

> READ THIS ENTIRE FILE BEFORE DOING ANYTHING.
> Then read **README.md** and **CLAUDE.md** fully.
> Follow every step in order. Do not skip steps.

---

## STEP 1 — Read First

Before writing any code or running any command:

1. Read `CLAUDE.md` — coding rules, schema, business logic
2. Read `README.md` — project overview
3. Read `IMPLEMENTATION_PLAN.md` — what needs to be implemented

---

## STEP 2 — Make Your Changes

Implement whatever is described in `IMPLEMENTATION_PLAN.md`.

After **every file change**, run:
```bash
npm run typecheck
```
Fix all errors before continuing. Never move to the next step with TypeScript errors.

---

## STEP 3 — Commit Your Changes

### 3a. Stage only the files you changed
Never use `git add .` or `git add -A`. Stage specific files:

```bash
git add src/renderer/src/components/SomeComponent.tsx
git add src/renderer/src/pages/SomePage.tsx
# ... only the files you actually changed
```

### 3b. Write a descriptive commit message
The message must describe WHAT changed and WHY. Use these prefixes:

| Prefix | When to use |
|--------|-------------|
| `feat:` | New feature added |
| `fix:` | Bug fixed |
| `chore:` | Config, cleanup, no logic change |
| `refactor:` | Code restructured, no behavior change |

**Format:**
```bash
git commit -m "feat: Flight Status panel on Dashboard with scheduled/flying/arrived states

- Added FlightStatusPanel component with real-time status computation
- Empty state shown when no AWBs with ETA/ATA exist
- Status refreshes every 60 seconds automatically

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
```

### 3c. Push to GitHub
```bash
git push origin main
```

---

## STEP 4 — Version Bump

### Versioning rules
Current version is in `package.json` → `"version"` field.

| Current | Next |
|---------|------|
| 1.0.3 | 1.0.4 |
| 1.0.8 | 1.0.9 |
| 1.0.9 | 1.1.0 |
| 1.1.9 | 1.2.0 |
| 1.9.9 | 2.0.0 |

**Rules:**
- Patch (`x.x.+1`): bug fixes, small UI tweaks
- Minor (`x.+1.0`): new features, significant additions
- Major (`+1.0.0`): breaking changes, complete rewrites (rare)

### How to bump the version

**File 1 — `package.json`:**
Find `"version": "1.0.3"` and change it to the new version.

**File 2 — `src/main/index.ts`:**
If there is a hardcoded version string like `1.0.3`, update it there too.

**File 3 — `.env`:**
If `VITE_APP_VERSION=1.0.3` exists, update it.

After updating all version references:
```bash
npm run typecheck
```

### Commit the version bump separately
```bash
git add package.json src/main/index.ts .env
git commit -m "chore: bump version to 1.0.X

Co-Authored-By: Claude Sonnet 4.6 <noreply@anthropic.com>"
git push origin main
```

---

## STEP 5 — Build the App

### Windows build (run this on Windows):
```bash
npm run build:win
```

### Mac build (run this on Mac):
```bash
npm run build:mac
```

Output files will be in: `dist-electron/`

**Windows produces:**
- `npd-planner-1.0.X-setup.exe` — installer (this is the file users download)

**Mac produces:**
- `npd-planner-1.0.X.dmg` — disk image (this is the file users download)

> If you are on Windows, you can only build the Windows `.exe`.
> The Mac `.dmg` must be built on a Mac.

---

## STEP 6 — Create a GitHub Release

### 6a. Create a git tag for the version
```bash
git tag v1.0.X
git push origin v1.0.X
```
Replace `1.0.X` with the actual new version number (e.g., `v1.0.4`).

### 6b. Create the GitHub Release with the built files

```bash
gh release create v1.0.X \
  "dist-electron/npd-planner-1.0.X-setup.exe" \
  --title "NPD Planner v1.0.X" \
  --notes "$(cat <<'EOF'
## What's New in v1.0.X

### New Features
- [List each new feature added]

### Bug Fixes
- [List each bug fixed]

### Improvements
- [List each improvement or UI update]

---

## Download

| Platform | File |
|----------|------|
| Windows  | `npd-planner-1.0.X-setup.exe` |
| Mac      | *(build separately on Mac)* |

## Installation
**Windows:** Download and run `npd-planner-1.0.X-setup.exe`
**Mac:** Download `npd-planner-1.0.X.dmg`, open it, drag NPD Planner to Applications
EOF
)"
```

> If the Mac `.dmg` was also built, add it to the release:
> ```bash
> gh release upload v1.0.X "dist-electron/npd-planner-1.0.X.dmg"
> ```

### 6c. Get the release link

After the release is created, run:
```bash
gh release view v1.0.X --web
```

Or get the direct URL:
```bash
gh release view v1.0.X --json url -q .url
```

**Give this URL to the user at the end.** It will look like:
```
https://github.com/Carlosmsc491/npd-planner/releases/tag/v1.0.X
```

---

## STEP 7 — Final Checklist

Before considering the task complete, confirm:

- [ ] `npm run typecheck` passes with zero errors
- [ ] All changed files committed with a descriptive message
- [ ] `git push origin main` succeeded
- [ ] Version bumped in `package.json` (and `.env` if applicable)
- [ ] Version bump committed and pushed
- [ ] Windows `.exe` built successfully in `dist-electron/`
- [ ] Git tag `v1.0.X` created and pushed
- [ ] GitHub Release created with the `.exe` attached
- [ ] Release URL provided to the user

---

## DO NOT

- Do NOT commit `test-app/` or `test-app-new/` — they are in `.gitignore`
- Do NOT commit `.env` — it contains Firebase credentials
- Do NOT use `git add .` or `git add -A`
- Do NOT push with `--force` unless instructed
- Do NOT skip `npm run typecheck`
- Do NOT use `any` in TypeScript
