# NPD Planner — Quick Start Guide

## What's in this folder

| File | Purpose |
|---|---|
| `CLAUDE.md` | **Master context file** — Claude Code reads this first in every session |
| `PROMPTS.md` | **All 8 build prompts** — copy-paste these into Claude Code in order |
| `src/types/index.ts` | All TypeScript interfaces for the entire app |
| `src/lib/firebase.ts` | Firebase initialization (reads from .env) |
| `src/lib/firestore.ts` | All Firestore read/write operations |
| `src/lib/sharepointLocal.ts` | SharePoint local file handling |
| `src/main/ipc/fileHandlers.ts` | Electron IPC for file system access |
| `src/main/ipc/notificationHandlers.ts` | Desktop notification handling |
| `src/utils/utils.ts` | Utilities: hash, colors, dates, CSV export |
| `firestore.rules` | Firebase security rules — deploy to Firebase |
| `.env.example` | Environment variable template |
| `.gitignore` | Git ignore rules |

---

## Step-by-step setup

### 1. Install prerequisites
- **Node.js 20 LTS** → https://nodejs.org/en/download (choose LTS)
- **Git** → https://git-scm.com
- **Claude Code** → open terminal and run:
  ```
  npm install -g @anthropic-ai/claude-code
  ```

### 2. Create Firebase project
1. Go to https://console.firebase.google.com
2. Click "Add project" → name it `npd-planner`
3. In the project: click "Build" → "Firestore Database" → Create (production mode)
4. Click "Build" → "Authentication" → "Get started" → Enable "Email/Password"
5. Click the gear icon → "Project settings" → scroll to "Your apps" → click `</>` (web)
6. Register app → copy the `firebaseConfig` object — you'll need it for `.env`

### 3. Create your project folder
```bash
mkdir npd-planner
cd npd-planner
git init
```

### 4. Copy these files into the project
Copy all files from this folder into your `npd-planner` folder, maintaining the folder structure.

### 5. Create your .env file
```bash
cp .env.example .env
```
Open `.env` and paste your Firebase credentials from Step 2.

### 6. Start Claude Code
```bash
claude
```

### 7. Follow the prompts in PROMPTS.md
Open `PROMPTS.md` and paste **Prompt 0** first, then follow in order (1 through 8).

---

## Important rules

- **Never commit `.env`** — it contains your Firebase credentials
- **Always start Claude Code sessions with**: "Read CLAUDE.md completely before starting"
- **Commit after each prompt** — Claude will do this automatically if you follow the prompts
- **Test before moving to next prompt** — run the app and verify the features work

---

## Building the final app

After all 8 prompts are complete:

**Windows (.exe):**
```bash
npm run build:win
```

**Mac (.dmg):**
```bash
npm run build:mac
```

**Both:**
```bash
npm run build
```

Output files will be in the `dist-electron/` folder.

---

## Deploying Firebase security rules

After Prompt 2, deploy the security rules:
```bash
npm install -g firebase-tools
firebase login
firebase init firestore
firebase deploy --only firestore:rules
```

---

## Contact & support

App: NPD Planner  
Company: Elite Flower  
Auth domain: @eliteflower.com only
