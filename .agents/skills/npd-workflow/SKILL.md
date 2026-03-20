---
name: npd-workflow
description: Mandatory workflow for NPD Planner project. Use EVERY TIME before responding to any user request. This skill ensures proper project workflow by requiring read of CHANGES.md, CLAUDE.md, README.md, and IMPLEMENTATION_PLAN.md before making any changes. Triggers on all user messages related to NPD Planner development, code changes, features, bug fixes, or deployments.
---

# NPD Planner Workflow

> **MANDATORY**: Follow this workflow BEFORE every response to the user.

## Pre-Flight Checklist (Do This First)

Before writing code, running commands, or making any changes:

1. **Read CHANGES.md** — Contains the complete release workflow, commit guidelines, and deployment steps
2. **Read CLAUDE.md** — Coding rules, schemas, business logic, and project conventions  
3. **Read README.md** — Project overview and quick start
4. **Read IMPLEMENTATION_PLAN.md** — Current implementation tasks and priorities

## Critical Rules

### Always Run TypeCheck
After **every file change**, run:
```bash
npm run typecheck
```
Fix all TypeScript errors before continuing. Never proceed with errors.

### Never Use git add .
Stage only files you actually changed:
```bash
git add src/renderer/src/components/SomeComponent.tsx
git add src/renderer/src/pages/SomePage.tsx
```

### Commit Message Format
Use conventional commits with prefixes:
- `feat:` — New feature
- `fix:` — Bug fix  
- `chore:` — Config, cleanup
- `refactor:` — Code restructuring

### Version Bumping
When releasing, update version in:
1. `package.json` → `"version"`
2. `.env` → `VITE_APP_VERSION` (if exists)

Follow semver: patch (x.x.+1), minor (x.+1.0), major (+1.0.0)

### Build Process
For Windows releases:
```bash
npm run build:win
```
Output: `dist-electron/npd-planner-X.X.X-setup.exe`

### Release Process
1. Commit all changes
2. Bump version
3. Build `.exe`
4. Create git tag: `git tag vX.X.X && git push origin vX.X.X`
5. Create GitHub release with the `.exe`
6. Give user the release URL

## DO NOT

- Do NOT skip reading CHANGES.md
- Do NOT commit `test-app/` or `test-app-new/`
- Do NOT commit `.env`
- Do NOT use `git add .` or `git add -A`
- Do NOT skip `npm run typecheck`
- Do NOT use `any` in TypeScript
- Do NOT push with `--force`

## Quick Reference

| Task | Command |
|------|---------|
| Type check | `npm run typecheck` |
| Dev server | `npm run dev` |
| Build Windows | `npm run build:win` |
| Build Mac | `npm run build:mac` |

## File Locations

- Source code: `src/renderer/src/`
- Components: `src/renderer/src/components/`
- Pages: `src/renderer/src/pages/`
- Types: `src/renderer/src/types/`
- Build output: `dist-electron/`
