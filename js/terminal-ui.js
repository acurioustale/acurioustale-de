// Pure interaction logic for the terminal glue in terminal.js, extracted so the
// fiddly parts (the scrollback cap threshold, history recall's index arithmetic
// and the focus-steal guard) can be unit-tested without a DOM. The DOM wiring
// that calls these lives in terminal.js. See test/terminalUi.test.js.

// How many leading scrollback nodes to drop so the log holds at most `max`.
// A strict upper bound: exactly `count - max` when over the cap, never negative.
// Kept as a function so the boundary (drop only past `max`, never at it) is
// pinned rather than buried in a loop condition.
export function capLimit(count, max) {
  return Math.max(0, count - max);
}

// The ↑/↓ command-history recall as a pure state transition. `index` ranges over
// [0, entries.length]; index === entries.length is the live prompt, which has no
// history entry of its own. `current` is the text in the input right now, and
// `drafts` is a map of index → edited text for every line the user has changed
// this recall session (the live prompt included). `direction` is "up" or "down".
//
// Edits are preserved like readline: stepping off a line saves its current text
// into `drafts`, so navigating back shows that edit rather than the pristine
// history entry, and the live buffer the user was typing survives an up-and-back
// round trip. Submitting a command clears `drafts` (the caller's job), which
// reverts any unsubmitted edits — again matching a real shell.
//
// Returns the next { index, drafts, value } — `value` being what to place in the
// input, `drafts` the updated overlay — or null when the key doesn't move (empty
// history, an unknown key, or already at an end) so the caller leaves the input
// untouched.
export function recallHistory(entries, index, drafts, current, direction) {
  const delta = direction === "up" ? -1 : direction === "down" ? 1 : 0;
  const nextIndex = index + delta;
  if (delta === 0 || nextIndex < 0 || nextIndex > entries.length) return null;
  // Save the (possibly edited) text of the line being left, then show the draft
  // for the destination if one exists, else the pristine entry. The live prompt
  // has no entry, so it falls back to an empty field when it has no draft yet.
  const nextDrafts = { ...drafts, [index]: current };
  const value =
    nextIndex in nextDrafts
      ? nextDrafts[nextIndex]
      : (entries[nextIndex] ?? "");
  return { index: nextIndex, drafts: nextDrafts, value };
}

// Whether a resize warrants re-freezing the screen height. Only a width change
// reflows the card and so changes the boot height; a height-only resize leaves
// the frozen height correct, so it must be a no-op (this guard is the whole
// reason the ResizeObserver is preferred over window resize events). Shared by
// both the ResizeObserver and the resize-listener fallback in terminal.js.
export function shouldRefit(newWidth, lastWidth) {
  return newWidth !== lastWidth;
}
