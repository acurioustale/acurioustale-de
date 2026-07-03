import { test } from "node:test";
import assert from "node:assert/strict";
import { loadModule } from "./helpers/dom.js";

// The command replies (commands.js) and the recall/focus/cap logic
// (terminal-ui.js) are unit-tested directly. These cover the wiring in
// terminal.js: that the input is injected, and that keystrokes actually echo,
// dispatch, clear, recall and prune the scrollback in the DOM.

const LOG = '.screen div[aria-live="polite"]';

function keydown(window, el, key) {
  el.dispatchEvent(
    new window.KeyboardEvent("keydown", {
      key,
      bubbles: true,
      cancelable: true,
    }),
  );
}

// Type `value` into the input and press Enter.
function submit(window, input, value) {
  input.value = value;
  keydown(window, input, "Enter");
}

test("injects a command input when the device has a fine pointer", async () => {
  const { document } = await loadModule("js/terminal.js", {
    pointerFine: true,
  });
  const input = document.querySelector(".prompt-last .cmd-input");
  assert.ok(input, "expected a .cmd-input in the prompt line");
  assert.equal(input.getAttribute("aria-label"), "Terminal — type a command");
});

test("adds no input on a touch-only device (coarse pointer)", async () => {
  const { document } = await loadModule("js/terminal.js", {
    pointerFine: false,
  });
  assert.equal(document.querySelector(".cmd-input"), null);
});

test("Enter echoes the command and shows the reply", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  submit(window, input, "whoami");
  assert.match(log.textContent, /\$ whoami/, "the command is echoed");
  assert.match(log.textContent, /command not found/, "the reply is shown");
  assert.equal(input.value, "", "the input is cleared after running");
});

test("typed input is rendered as text, never markup", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  submit(window, input, "<img src=x onerror=alert(1)>");
  assert.equal(log.querySelector("img"), null, "no element may be injected");
  assert.ok(log.textContent.includes("<img src=x onerror=alert(1)>"));
});

test("clear empties the scrollback and hides the boot output", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);
  const boot = document.querySelector(".boot-container");

  submit(window, input, "help");
  assert.ok(log.children.length > 0);

  submit(window, input, "clear");
  assert.equal(log.textContent, "", "the scrollback is wiped");
  assert.equal(boot.style.display, "none", "the boot output is hidden");
});

test("./whoami.sh reprints the whoami card with its heading demoted", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  submit(window, input, "./whoami.sh");
  const clone = log.querySelector(".whoami");
  assert.ok(clone, "expected the whoami block cloned into the log");
  assert.equal(
    clone.querySelector("h1"),
    null,
    "the cloned h1 must be demoted",
  );
  assert.ok(clone.querySelector("p.name"), "the heading becomes a p.name");
});

test("ls projects/ tolerates the trailing slash and reprints the list", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  submit(window, input, "ls projects/");
  assert.ok(
    log.querySelector(".projects"),
    "expected the projects block cloned into the log",
  );
});

test("./whoami.sh/ errors instead of reprinting the card", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  submit(window, input, "./whoami.sh/");
  assert.equal(
    log.querySelector(".whoami"),
    null,
    "a trailing slash on the file must not reprint the card",
  );
  assert.match(
    log.textContent,
    /No such file or directory/,
    "the trailing-slash file path is denied like a real shell",
  );
});

test("Arrow keys recall previous commands", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");

  submit(window, input, "date");
  submit(window, input, "uptime");

  keydown(window, input, "ArrowUp");
  assert.equal(input.value, "uptime");
  keydown(window, input, "ArrowUp");
  assert.equal(input.value, "date");
  keydown(window, input, "ArrowDown");
  assert.equal(input.value, "uptime");
});

test("a bare Enter resets recall to the most recent command", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");

  submit(window, input, "date");
  submit(window, input, "uptime");

  // Recall up to "uptime", clear the field, then submit an empty line.
  keydown(window, input, "ArrowUp");
  assert.equal(input.value, "uptime");
  submit(window, input, ""); // bare Enter

  // Recall must return to the latest command, not resume mid-history at "date".
  keydown(window, input, "ArrowUp");
  assert.equal(
    input.value,
    "uptime",
    "ArrowUp after a bare Enter recalls the most recent command",
  );
});

test("scrollback is capped so a long session can't grow the DOM unbounded", async () => {
  const { window, document } = await loadModule("js/terminal.js");
  const input = document.querySelector(".cmd-input");
  const log = document.querySelector(LOG);

  // Each command appends an echo + a reply (2 nodes); 150 commands would reach
  // 300 without the cap.
  for (let i = 0; i < 150; i++) submit(window, input, "cmd" + i);
  assert.ok(log.children.length > 0);
  assert.ok(
    log.children.length <= 200,
    `scrollback grew to ${log.children.length} nodes`,
  );
});
