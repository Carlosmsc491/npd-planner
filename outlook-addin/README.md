# NPD Planner — Outlook Add-in

Adds an "Assign to NPD Task" button in the Outlook ribbon that sends the selected email (+ attachments) directly to an NPD Planner task — no saving files manually.

## How it works

```
Outlook ribbon button
  → panel opens (React taskpane)
  → Office.js reads email + attachments
  → user selects Board → Bucket → Task
  → HTTP POST to localhost:3847 (Electron)
  → Electron saves attachments to SharePoint folder
  → Firestore updated — email appears in task
```

**Requirement:** NPD Planner must be open on the same PC.

---

## Dev setup (one time)

```bash
cd outlook-addin
npm install
npm run certs       # installs trusted self-signed cert for localhost:3000
npm run dev         # starts https://localhost:3000
```

Then in Outlook:
1. More apps → Manage your apps → Upload a custom app
2. Select `manifest.xml`
3. Open any email → click **Assign to NPD Task** in the ribbon

---

## Production

For distribution, the webpack bundle can be served directly by Electron on the same port, eliminating the need for a separate dev server. Update `manifest.xml` to point to the Electron-hosted URL.
