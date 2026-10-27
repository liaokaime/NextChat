/** Leading update plus a bounded trailing batch; completion/abort always flushes. */
export function createStreamUpdates(commit: () => void, interval = 40) {
  let timer: ReturnType<typeof setTimeout> | undefined;
  let lastCommit: number | undefined;
  let pending = false;
  let closed = false;
  const flush = () => {
    if (timer !== undefined) clearTimeout(timer);
    timer = undefined;
    if (!pending) return;
    pending = false;
    lastCommit = Date.now();
    commit();
  };
  return {
    schedule() {
      if (closed) return;
      pending = true;
      const elapsed =
        lastCommit === undefined ? interval : Date.now() - lastCommit;
      if (elapsed >= interval) flush();
      else if (timer === undefined)
        timer = setTimeout(flush, interval - elapsed);
    },
    finish() {
      closed = true;
      flush();
    },
  };
}
