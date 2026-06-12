# NPD Planner — Teams Platform (feature/teams)

> **Read this file before touching any teams/requests code.**
> This is the dictionary for the multi-team platform: data model, permissions,
> flows, file map and pending work. It complements CLAUDE.md (which describes
> the production app). Everything here ships DARK behind `TEAMS_MODULE_ENABLED`
> in `src/shared/constants.ts` and lives only on the `feature/teams` branch.

---

## 1. What this is

NPD MIAMI (New Product Development) builds bouquets, arrangements, catalogs,
samples, shows and meetings. Sales teams (one team per account: Publix Team,
Walmart Team…) file **sample requests** that land as **tasks in the NPD
Planner board** under the team's client and the chosen bucket. The request is
the team-facing view (follow-up, logistics, comments); the task is the
NPD-facing view. NPD admins oversee and can fix anything across teams.

```
Sales person files request ──► sampleRequests doc + linked task (Planner board)
        │                                 │
        │  follow-up timeline             │  NPD works the task as usual
        │  comments / notifications      │
        ▼                                 ▼
Account manager fills logistics   NPD completes task ──► request auto-completes
(order #, farm, AWB, ETA)         + everyone notified ("report copy" signal)
```

---

## 2. Governance hierarchy (5 levels)

| Level | Who | Powers | Stored as |
|---|---|---|---|
| **Founder** | Carlos (exactly ONE) | Everything + mint/demote owners + transfer founder ("legacy") | `settings/platform.founderUid` |
| **Owner** | 2-3 god users | Everything except managing owners/founder | `users.role = 'owner'` |
| **Admin** | NPD MIAMI staff | See/fix everything across teams; manage members | `users.role = 'admin'` |
| **Team member** | Sales / AM / Support | Their team(s) only — full isolation | `teamMembers` docs |
| **Assigned** | Helpers etc. | Only requests where they appear in `assignedManagers`/`helpers` | arrays on the request |

Key founder rules (client `permissions.ts` + server `firestore.rules`):
- Only the founder assigns/demotes/suspends/deletes **owners**.
- Nobody can suspend or delete the founder.
- Founder transfer: `transferFounder()` promotes the target to owner and
  rewrites `founderUid`. Irreversible by the old founder (confirmation modal).
- Bootstrap: the first active owner to open the app claims founder
  (self-healing listener in **App.tsx** — NOT useAuth, see §7 warning).
- Emergency master-key recovery (`emergencyUnlocks`) can also reclaim founder.

**Role vs membership:** the global `role` says what you are on the platform;
`teamMembers.teamRole` says what you are *inside each team*. Sean can be
`sales` in Publix Team AND `sales` in Harris Teeter Team; an AM can serve
many teams; the same person could be sales in one and AM in another.

---

## 3. Firestore collections (new in this branch)

### `settings/platform` (single doc)
```typescript
{ founderUid: string, transferredFrom?: string, transferredAt?: Timestamp }
```

### `teams/{teamId}`
```typescript
{ id, name: 'Publix Team', clientId: string | null, active: boolean,
  createdBy, createdAt }
```

### `teamMembers/{teamId_uid}`   ← deterministic id, enables rules exists()
```typescript
{ id: `${teamId}_${uid}`, teamId, uid,
  teamRole: 'sales' | 'account_manager' | 'support',
  addedBy, addedAt }
```

### `sampleRequests/{requestId}`
```typescript
{ id, teamId, teamName, clientId, bucket, title, description,
  needByDate, shipDate,                       // Timestamps | null
  status: 'submitted' | 'accepted' | 'in_production' | 'ready' |
          'handed_to_shipping' | 'shipped' | 'delivered' |
          'completed' | 'cancelled',
  createdBy, createdByName,                   // the sales person
  assignedManagers: string[], helpers: string[],
  orderNumber, farmInfo, awbNumber, eta,      // logistics — AM fills these
  linkedTaskId: string | null,                // task in the Planner board
  createdAt, updatedAt, updatedBy }
```

Subcollections:
- `events/{eventId}` — append-only follow-up timeline
  `{ type: 'created'|'status_change'|'field_update'|'assignment', message, userId, userName, createdAt }`
- `comments/{commentId}` — `{ authorId, authorName, text, createdAt }`

### Extended existing types
- `Task` + `sourceTeamId?` / `sourceRequestId?` — set when born from a request;
  rules use `sourceTeamId` to let sales create the linked task.
- `AppNotification` + `requestId?` — NotificationCenter navigates to `/requests`.

---

## 4. Permission matrix (sample requests)

| Action | Sales (creator) | AM of team / assigned | Support/helper (assigned) | Other teams | NPD admin/owner |
|---|---|---|---|---|---|
| Create request | ✅ (own team only) | ❌ | ❌ | ❌ | ✅ |
| View request | ✅ | ✅ | ✅ | ❌ **never** | ✅ |
| Edit core (title/desc/dates/bucket) | ✅ while `submitted` | ❌ | ❌ | ❌ | ✅ always |
| Logistics (order/farm/AWB/ETA) | ❌ | ✅ | ❌ | ❌ | ✅ |
| Change status | ❌ | ✅ | ❌ | ❌ | ✅ |
| Comment | ✅ | ✅ | ✅ | ❌ | ✅ |
| Delete request | ❌ | ❌ | ❌ | ❌ | ✅ |

All of it enforced twice: client helpers in `lib/permissions.ts` AND
server-side in `firestore.rules` (field-scoped via `diff().affectedKeys()`).

---

## 5. Notifications & email

**In-app (works on free tier, already live):**
| Event | Recipients |
|---|---|
| Request created | NPD admins/owners (minus actor) |
| Status change / logistics update | creator + managers + helpers (minus actor) |
| Comment | creator + managers + helpers (minus actor) |
| Manager assigned | the assigned manager |
| Task completed by NPD | participants — the "report copy" signal |

Recipient logic is pure + tested: `lib/requestNotifications.ts`.

**Manual email ("Send Email Update" button on the request detail):**
`lib/requestEmail.ts` builds a `mailto:` with subject/body prefilled
(date, truck/carrier, client, order #, AWB, free text) and opens the OS mail
app via `shell.openExternal`. Recipients = creator + assigned managers.

**Automatic emails = Fase 4, NOT BUILT:** requires Blaze plan + Cloud
Functions + an email service (Resend/SendGrid). Carlos approved switching
to Blaze when everything else is ready.

---

## 6. File map (what this branch added/changed)

```
src/shared/constants.ts            TEAMS_MODULE_ENABLED flag  ← false on merge!
src/renderer/src/
├── types/index.ts                 +PlatformGovernance, Team, TeamMember,
│                                  SampleRequest(+Event/Comment), Task.source*,
│                                  AppNotification.requestId
├── lib/
│   ├── permissions.ts             +isFounder, canTransferFounder, founder-aware
│   │                              canChangeRole/canAssignRole/canSuspendUser,
│   │                              canManageTeams, getTeamRole, canViewTeam,
│   │                              canCreateSampleRequest, canViewSampleRequest,
│   │                              canManageRequestLogistics, canEditRequestCore
│   ├── teamsFirestore.ts          teams + memberships CRUD/subscriptions
│   ├── requestsFirestore.ts       requests: create (batch w/ linked task),
│   │                              status/logistics/core updates, comments,
│   │                              events, notifications fan-out,
│   │                              completeLinkedRequest (task→request sync)
│   ├── requestEmail.ts            mailto builder (pure, tested)
│   ├── requestNotifications.ts    recipient logic (pure, tested)
│   ├── firestore.ts               +subscribeToPlatformGovernance,
│   │                              bootstrapFounder, transferFounder;
│   │                              completeTask() now closes linked requests
│   └── __tests__/                 permissions.test.ts, requestEmail.test.ts
├── store/
│   ├── authStore.ts               +founderUid
│   ├── teamStore.ts               teams/members/myMemberships
│   └── requestStore.ts            admin: all; member: mine+assigned (merged)
├── pages/
│   ├── RequestsPage.tsx           /requests — list, NewRequestModal,
│   │                              RequestDetailModal (pipeline, logistics,
│   │                              timeline, comments, email modal)
│   └── SettingsPage.tsx           +Teams tab (flag-gated)
├── components/
│   ├── settings/TeamsPanel.tsx    create teams, manage memberships per-role
│   ├── settings/MembersPanel.tsx  founder badge 👑, Make Owner,
│   │                              Transfer Founder (Legacy)
│   ├── ui/AppLayout.tsx           Requests sidebar entry + memberships listener
│   └── notifications/NotificationCenter.tsx  requestId → /requests
├── App.tsx                        founder governance listener + bootstrap,
│                                  /requests route
firestore.rules                    founder, teams isolation, sampleRequests,
                                   events (getAfter), comments, tasks create
                                   extension for sales
firestore.indexes.json             sampleRequests: createdBy+createdAt,
                                   assignedManagers+createdAt
.firebaserc                        default = npd-project-teams (dev!)  ← revert on merge
```

---

## 7. Critical warnings for future sessions

1. **`hooks/useAuth.ts` is DEAD CODE.** No component mounts it. Real auth
   state handling lives in `App.tsx` (`onAuthStateChanged` + user doc
   listener). Anything that must run "on login" goes in App.tsx.
2. **This worktree points to the DEV Firebase project** (`npd-project-teams`)
   via `.env` and `.firebaserc`. `firebase deploy` here can never hit
   production. Production lives in `~/npd-planner` (branch `main`,
   project `npd-planner`).
3. **No GH_TOKEN in this worktree's .env** — releases are impossible from
   here, on purpose. Never add it.
4. **`teamMembers` doc ids are `{teamId}_{uid}`** — rules depend on this for
   exists()-based membership checks. Never use addDoc for memberships.
5. **Events use `getAfter()`** in rules because the first event is written in
   the same batch as the request. Don't "simplify" it to get().
6. **Notifications must never throw** — they're fire-and-forget after the
   main write (see `notifyUids`).
7. **Quota:** Firestore free tier. Every listener must stay scoped (per-uid
   queries, single docs). No unbounded collection listeners outside the
   admin-only panels.

## 8. Merge-to-main checklist (when this ships)

- [ ] `TEAMS_MODULE_ENABLED = false` in `src/shared/constants.ts`
- [ ] `.firebaserc` default back to `npd-planner` (prod)
- [ ] Deploy `firestore.rules` + `firestore.indexes.json` to PROD project
      (additive — new collections don't affect existing data)
- [ ] Re-run the whole test suite + `npm run build`
- [ ] Verify the founder bootstrap against prod data (Carlos's owner account
      claims founder on first login after deploy)
- [ ] Then enable the flag in a release when Carlos decides

## 9. Pending work (in order)

1. **Attachments on requests** — needs a SharePoint strategy decision for
   sales machines (they may not have the sync folder).
2. **Fase 4 — automatic emails:** Blaze plan → Cloud Functions → Resend or
   SendGrid. Triggers mirror the in-app notification table (§5).
3. **Printable/PDF report** on completion (today the "report" is the
   completion notification + the full follow-up timeline in the app).
4. Team-wide request views for AMs (today: created-by-me + assigned-to-me;
   rules already allow team-wide reads).
5. Periodic `main → feature/teams` merges after every production release.

## 10. Dev environment quickstart

```bash
cd ~/npd-planner-teams && npm run dev      # teams platform (DEV Firebase)
cd ~/npd-planner                            # production work (main)
```

Test users in dev: carlosmsc491@eliteflower.com (owner + FOUNDER),
cmsalazar@eliteflower.com (member; sales in "Publix Team test").
Run tests: `npm run test` (vitest, 47 tests). Typecheck: `npm run typecheck`.
Deploy rules to dev: `firebase deploy --only firestore` (default = dev).
