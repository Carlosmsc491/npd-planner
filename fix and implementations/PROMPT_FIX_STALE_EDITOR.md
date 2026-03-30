━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
PROMPT — Fix Stale Content in RichTextEditor + Text Field Audit
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━

Read CLAUDE.md before starting.

Read these files in full before writing any code:
- src/renderer/src/components/task/RichTextEditor.tsx
- src/renderer/src/components/task/TaskPage.tsx
- src/renderer/src/components/myspace/PersonalNotes.tsx
- src/renderer/src/pages/MySpacePage.tsx

---

## Root cause

TipTap's `useEditor` initializes its internal document from `content` only ONCE
on mount. It does NOT react to prop changes after that. When the user opens
Task A, then opens Task B in the same panel without unmounting the component,
the editor still shows Task A's description.

The same risk applies to `notes` field if it uses the same editor.

---

## Fix 1 — RichTextEditor.tsx: sync content when prop changes

### Checklist

- [ ] In `RichTextEditorInner`, add a `useEffect` that calls `editor.commands.setContent()`
  when the `content` prop changes, but ONLY if the editor is not currently focused
  (to avoid interrupting the user mid-typing):

  ```typescript
  useEffect(() => {
    if (!editor) return
    // Don't reset while the user is actively editing
    if (editor.isFocused) return
    const incoming = normalizeContent(content)
    // Only update if the content is actually different to avoid cursor resets
    if (editor.getHTML() !== incoming) {
      editor.commands.setContent(incoming, false) // false = don't emit update
    }
  }, [content, editor])
  ```

- [ ] Import `useEffect` at the top of the file if not already imported
  (check current imports — `useState` and `useCallback` are there, add `useEffect`)

- [ ] Verify the effect runs correctly: the dependency array is `[content, editor]`

---

## Fix 2 — TaskPage.tsx: force remount of RichTextEditor when task changes

Even with Fix 1, there is a safer belt-and-suspenders approach: add a `key` prop
to the `<RichTextEditor>` in `TaskPage` so React fully remounts it when the task ID changes.
This guarantees a clean slate regardless of TipTap's internal state.

- [ ] Find the `<RichTextEditor>` for description in `TaskPage.tsx`:
  ```tsx
  <RichTextEditor
    content={task.description ?? ''}
    onBlur={saveDescription}
  />
  ```
- [ ] Add `key={task.id + '-description'}`:
  ```tsx
  <RichTextEditor
    key={task.id + '-description'}
    content={task.description ?? ''}
    onBlur={saveDescription}
  />
  ```

- [ ] If there is a second `<RichTextEditor>` in `TaskPage` for notes, apply the same key:
  ```tsx
  key={task.id + '-notes'}
  ```

---

## Fix 3 — Audit all other text fields in TaskPage for the same stale-state bug

TipTap editors are the main risk, but also check `<input>` and `<textarea>` fields
that use `defaultValue` instead of `value` — these also don't react to prop changes.

- [ ] In `TaskPage.tsx`, search for all `defaultValue={task.*}` patterns.
  For each one found, check if the same TaskPage component instance is reused
  across different tasks (i.e., if `task.id` can change without unmounting).

- [ ] For any `defaultValue` on an input that shows task-specific content
  (title draft, PO number, notes text, etc.), add a `key` prop to force remount
  when `task.id` changes:
  ```tsx
  <input
    key={task.id + '-fieldname'}
    defaultValue={task.fieldname}
    ...
  />
  ```
  
  Alternatively, convert from `defaultValue` to controlled `value` with a `useEffect`
  to sync — whichever is simpler for that specific field.

- [ ] Check `titleDraft` state: verify there is already a `useEffect(() => { setTitleDraft(task.title) }, [task.title])`.
  If it's missing, add it.

---

## Fix 4 — PersonalNotes.tsx: verify no stale content issue

- [ ] Open `PersonalNotes.tsx`. It uses `<RichTextEditor content={localContent} ...>`.
- [ ] It already has `useEffect(() => { setLocalContent(content) }, [content])` to sync.
  Verify this effect exists and is correct.
- [ ] After Fix 1 is applied to `RichTextEditor`, PersonalNotes will also benefit
  automatically — no additional change needed if the effect is already there.
- [ ] If the `useEffect` syncing `localContent` from `content` is missing, add it.

---

## Fix 5 — Check NewTaskModal for stale state on reopen

When a user closes the NewTaskModal and opens it again, all state should reset.
This happens naturally if the modal unmounts on close. Verify this:

- [ ] In `NewTaskModal.tsx`, confirm that when `onClose()` is called, the modal is
  removed from the DOM (not just hidden with `display:none`).
- [ ] If the modal is conditionally rendered like `{showModal && <NewTaskModal ... />}`,
  it unmounts on close and state resets automatically. No fix needed.
- [ ] If it's always mounted and just hidden, the `description` field (if any) would
  be stale. In that case, either switch to conditional rendering or add reset logic
  in a `useEffect` that watches an `isOpen` prop.
- [ ] Note: the current `NewTaskModal` creates tasks with `description: ''` hardcoded,
  so description stale content is not an issue there — but verify title, client,
  bucket, and other fields do reset properly between opens.

---

## Verification

- [ ] Run `npm run typecheck` — zero errors
- [ ] Test: open Task A with a description → close → open Task B (no description)
  → description field is empty, not showing Task A's text
- [ ] Test: open Task A → edit description → open Task B → description shows Task B's content
- [ ] Test: Personal Notes still saves correctly after the fix
- [ ] Test: NewTaskModal opens clean (empty title, no client selected) on each open

---

## Commit message

```
fix: stale TipTap content when switching tasks

- RichTextEditor: add useEffect to sync content prop when not focused
- TaskPage: add key={task.id} to RichTextEditor to force remount on task change
- TaskPage: audit defaultValue inputs and add key props where needed
- PersonalNotes: verify content sync effect is present
```
