import { reply, help, blockFor } from "./commands.js";
import { capLimit, recallHistory, shouldRefit } from "./terminal-ui.js";

// Easter egg: turn the static prompt into a real input as progressive
// enhancement. Without JS the blinking cursor stays and nothing breaks.
// Most commands are denied, with the flavour reply() picks. The few that
// work: clear wipes the whole screen (the boot card included, like a real
// terminal), help lists the commands, and ./whoami.sh and ls projects/
// reprint the whoami card and the projects list.
const last = document.querySelector(".prompt-last");

// Desktop and hybrid laptops: enable the input on any device with a fine pointer.
// Setting inputMode = "none" ensures a stray tap on a touchscreen laptop or tablet
// with a trackpad won't pop up the on-screen keyboard, allowing physical keyboard
// typing without dead controls.
if (last && window.matchMedia && window.matchMedia("(pointer: fine)").matches) {
  const screen = last.parentNode;
  const cursor = last.querySelector(".cursor");

  // Scrollback for echoed commands and their replies. The prompt line
  // stays at the bottom; new output is inserted just above it.
  const log = document.createElement("div");
  log.setAttribute("aria-live", "polite");
  log.setAttribute("aria-atomic", "false");
  screen.insertBefore(log, last);

  // The page's boot output — the login line, the whoami card, the projects
  // list and their command lines — is static markup above the scrollback.
  // clear hides all of it so the screen truly empties; the originals stay in
  // the DOM (just hidden) so echoBlock can still clone them when a command
  // reprints.
  const boot = document.querySelector(".boot-container");

  const input = document.createElement("input");
  input.type = "text";
  input.className = "cmd-input";
  input.maxLength = 1000;
  input.setAttribute("aria-label", "Terminal — type a command");
  input.autocomplete = "off";
  input.autocapitalize = "none";
  input.spellcheck = false;
  input.inputMode = "none";
  last.insertBefore(input, cursor);

  // Measure text using a hidden span to accurately account for the rendered
  // pixel width of emojis and complex characters, which String.length
  // (UTF-16 code units) gets wrong. Modern browsers that support
  // field-sizing: content handle this natively via CSS, so the ghost element
  // and its forced-layout read are only set up as a fallback.
  let size = function () {};
  if (typeof CSS === "undefined" || !CSS.supports("field-sizing", "content")) {
    const ghost = document.createElement("span");
    ghost.className = "cmd-input";
    ghost.style.position = "absolute";
    ghost.style.visibility = "hidden";
    ghost.style.whiteSpace = "pre";
    ghost.style.width = "auto";
    ghost.style.maxWidth = "none";
    document.body.appendChild(ghost);

    // Grow the field with its content so the block cursor trails the text.
    size = function () {
      ghost.textContent = input.value;
      // Add 1px slack to prevent sub-pixel rounding from clipping the caret
      input.style.width =
        Math.ceil(ghost.getBoundingClientRect().width) + 1 + "px";
    };
    size();
    input.addEventListener("input", size);
  }

  // Freeze the screen at its boot height so command history scrolls inside
  // the window instead of growing it. Measured with the scrollback hidden and
  // the boot output momentarily restored, so the size is always the initial
  // card at the current width — never whatever has been typed since, and never
  // the collapsed single line left after clear has hidden the boot output.
  function fitScreen() {
    const prevLogDisplay = log.style.display;
    const prevBootDisplay = boot.style.display;
    boot.style.display = "";
    log.style.display = "none";
    screen.style.height = "auto";
    // Round up and add a hair of slack: the content height is often
    // fractional, and freezing to a value even a sub-pixel short trips the
    // scrollbar at some zoom levels and device pixel ratios.
    const height = Math.ceil(screen.getBoundingClientRect().height) + 2;
    log.style.display = prevLogDisplay;
    boot.style.display = prevBootDisplay;
    screen.style.height = height + "px";
    screen.scrollTop = screen.scrollHeight;
  }
  fitScreen();
  // Recompute only when the terminal's actual width changes: the card reflows,
  // changing the boot height. Using ResizeObserver avoids the layout thrashing
  // of window resize events (which fire on vertical resizes or when the window
  // exceeds the terminal's max-width).
  let lastWidth = screen.getBoundingClientRect().width;
  // Re-freeze the height only when the width actually changed. Shared by both
  // resize paths below so the guard can't drift between them.
  function refit(newWidth) {
    if (shouldRefit(newWidth, lastWidth)) {
      lastWidth = newWidth;
      fitScreen();
    }
  }
  if (window.ResizeObserver) {
    const ro = new ResizeObserver(function (entries) {
      // Read the border-box width the observer already computed rather than
      // calling getBoundingClientRect(), which would force a synchronous layout
      // every resize frame — the very thrash ResizeObserver is used here to
      // avoid. borderBoxSize matches the getBoundingClientRect() lastWidth was
      // seeded from; fall back to it on browsers with ResizeObserver but no
      // borderBoxSize.
      const entry = entries[0];
      const box = entry.borderBoxSize && entry.borderBoxSize[0];
      refit(box ? box.inlineSize : entry.target.getBoundingClientRect().width);
    });
    ro.observe(screen);
  } else {
    let resizeFrame = 0;
    window.addEventListener("resize", function () {
      if (resizeFrame) return;
      resizeFrame = requestAnimationFrame(function () {
        resizeFrame = 0;
        refit(screen.getBoundingClientRect().width);
      });
    });
  }

  // Echo the typed command, reusing the prompt/run styling. textContent
  // only — never innerHTML — so typed input can't inject markup.
  function echoLine(raw) {
    const echo = document.createElement("p");
    echo.className = "cmd";
    const p = document.createElement("span");
    p.className = "prompt";
    p.textContent = "$";
    const c = document.createElement("span");
    c.className = "run";
    c.textContent = " " + raw;
    echo.appendChild(p);
    echo.appendChild(c);
    log.appendChild(echo);
  }

  // Replay a static block (the whoami card or the projects list) as output
  // by cloning the original node, so it stays in sync with the page.
  function echoBlock(selector) {
    const node = document.querySelector(selector);
    if (!node) return;
    const clone = node.cloneNode(true);
    // Demote every cloned <h1> so replayed output doesn't add duplicate
    // top-level headings to the document outline.
    for (const heading of clone.querySelectorAll("h1")) {
      const p = document.createElement("p");
      p.className = heading.className;
      p.textContent = heading.textContent;
      heading.replaceWith(p);
    }
    log.appendChild(clone);
  }

  function replyLine(text) {
    const out = document.createElement("p");
    out.className = "reply";
    out.textContent = text;
    log.appendChild(out);
  }

  // The help listing is a preformatted block so its aligned columns and line
  // breaks survive (a <p> would collapse them onto one line).
  function helpBlock() {
    const out = document.createElement("pre");
    out.className = "help";
    out.textContent = help();
    log.appendChild(out);
  }

  const MAX_CMD_HISTORY = 100; // keyboard ↑/↓ recall depth (command entries)
  const MAX_LOG_NODES = 200; // DOM scrollback nodes before pruning
  const history = [];
  let historyIndex = 0;
  // Per-line edits made while recalling, keyed by history index (the live prompt
  // included). Cleared on every submit so unsubmitted edits revert, like a shell.
  let drafts = {};

  // Cap scrollback growth so long sessions don't bloat the DOM. Called from
  // every path that appends to the log, including a bare Enter, so repeatedly
  // submitting an empty prompt can't grow the DOM past the cap either.
  function capLog() {
    let remove = capLimit(log.children.length, MAX_LOG_NODES);
    while (remove-- > 0) {
      log.removeChild(log.firstElementChild);
    }
  }

  function run() {
    const raw = input.value;
    const rawCmd = raw.trim();

    // Dedupe and store the trimmed command: the executed form is rawCmd, so
    // "  clear" and "clear" are the same entry, and recall replays what ran. A
    // bare Enter stores nothing but still ends recall below.
    if (rawCmd && history[history.length - 1] !== rawCmd) {
      history.push(rawCmd);
      if (history.length > MAX_CMD_HISTORY) {
        history.shift();
      }
    }
    // Every Enter, even a bare one, ends recall: reset the cursor to the live
    // prompt so the next ArrowUp recalls the most recent command, like a shell,
    // and drop any unsubmitted per-line edits so recall starts from the pristine
    // history again.
    historyIndex = history.length;
    drafts = {};

    // Normalize internal consecutive whitespace to a single space for matching.
    const cmd = rawCmd.replace(/\s+/g, " ");

    // clear empties the screen: wipe the scrollback and hide the boot output,
    // leaving just the prompt, like a real terminal. It returns before the shared
    // echo/scroll tail below, since it produces no scrollback line of its own.
    if (cmd === "clear") {
      log.textContent = "";
      boot.style.display = "none";
      input.value = "";
      size();
      return;
    }

    echoLine(raw);

    // A non-empty command produces output; a bare Enter just echoes the empty
    // prompt. Commands that produce real output replay the matching static block
    // (blockFor resolves the command, trailing-slash rule and all); help lists
    // them; everything else is denied with reply()'s flavour.
    if (rawCmd) {
      const blockSelector = blockFor(cmd);
      if (blockSelector) {
        echoBlock(blockSelector);
      } else if (cmd === "help") {
        helpBlock();
      } else {
        replyLine(reply(rawCmd));
      }
    }

    capLog();

    input.value = "";
    size();
    // Keep the prompt in view as history scrolls up.
    screen.scrollTop = screen.scrollHeight;
  }

  input.addEventListener("keydown", function (e) {
    if (e.key === "Enter") {
      e.preventDefault();
      run();
    } else if (e.key === "ArrowUp" || e.key === "ArrowDown") {
      e.preventDefault();
      const direction = e.key === "ArrowUp" ? "up" : "down";
      const next = recallHistory(
        history,
        historyIndex,
        drafts,
        input.value,
        direction,
      );
      if (next) {
        historyIndex = next.index;
        drafts = next.drafts;
        input.value = next.value;
        size();
      }
    }
  });

  // Click anywhere in the terminal screen to focus the input — mirrors the
  // behaviour of a real terminal window. Guards prevent stealing focus when
  // the user is clicking a link or selecting text to copy.
  screen.addEventListener("click", function (e) {
    if (e.target.closest("a")) return;
    if (window.getSelection && window.getSelection().toString().length > 0)
      return;
    // preventScroll like the load focus: without it, focusing the prompt (at the
    // bottom of the frozen screen) yanks the scrollback down, discarding where
    // the user had scrolled to.
    input.focus({ preventScroll: true });
  });

  // Focus on load so typing works right away.
  input.focus({ preventScroll: true });
}
