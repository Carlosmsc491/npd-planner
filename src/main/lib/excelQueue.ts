// excelQueue.ts — a single global lock that serializes every operation that drives
// Microsoft Excel (cell writes, renames, UID writes, photo insert). Two Excel
// automations running at once collide — on Mac two AppleScript sessions
// opening/closing workbooks simultaneously surface the dreaded -1712 timeout, on
// Windows the COM server rejects concurrent calls. Running them one-at-a-time
// removes that class of failure; callers just await as before.

let chain: Promise<unknown> = Promise.resolve()

export function runExclusiveExcel<T>(fn: () => Promise<T>): Promise<T> {
  // Run after whatever is currently queued, regardless of how it settled.
  const run = chain.then(fn, fn)
  chain = run.catch(() => { /* keep the queue alive after a failure */ })
  return run
}
