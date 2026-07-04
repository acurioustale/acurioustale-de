// Pure terminal command logic, extracted so it can be unit-tested without a DOM
// (see test/commands.test.js). The DOM wiring lives in terminal.js.

// Stamped to the deploy time by deploy.sh (which regenerates the trailing ISO
// comment too, so it never drifts from the number). This checked-in value is a
// placeholder for local dev; formatUptime clamps it when it is still in the future.
export const LAST_DEPLOY = 1782509511000; // 2026-06-26T21:31:51Z

// The commands `help` advertises, so the prompt stays discoverable — without it
// a cleared screen gives no hint of what to type. The filesystem entries
// (whoami.sh and projects/) are deliberately left out: you find them by running
// `ls` and invoke them as in a real shell. Kept next to reply() so a test can
// bind this listing to what terminal.js actually dispatches.
export const ADVERTISED_COMMANDS = {
  ls: "list directory contents",
  uptime: "show how long the site has been running",
  date: "print the current date and time",
  sudo: "execute a command as superuser",
  echo: "write arguments to the standard output",
  clear: "clear the screen",
  help: "show this help",
};

export const STATIC_BLOCKS = {
  "./whoami.sh": ".whoami",
  "ls projects": ".projects",
};

// The commands terminal.js dispatches itself rather than through reply(),
// because they act on the DOM: `clear` wipes the screen and `help` renders the
// aligned help() listing as a preformatted block. Named here beside the other
// command tables (and consumed by terminal.js's run() dispatch) so the
// help/dispatch drift guard binds to this data instead of scraping terminal.js's
// source for `cmd === "…"` literals.
export const DOM_COMMANDS = { clear: "clear", help: "help" };

// Resolve a whitespace-normalized command line to the static block it reprints
// (the whoami card or the projects list), or undefined when it isn't one. The
// trailing-slash rule lives here, next to STATIC_BLOCKS, rather than in the DOM
// layer: a trailing slash is meaningful only after a directory operand, so
// `ls projects/` lists like `ls projects`, but `./whoami.sh/` is a file with a
// slash appended — an error, not a re-run. Hence the slash is tolerated only for
// the `ls ` listing form and every other block matches exactly. Object.hasOwn
// keeps inherited member names (`constructor`, `toString`) from matching.
export function blockFor(cmd) {
  const key = cmd.startsWith("ls ") ? cmd.replace(/\/+$/, "") : cmd;
  return Object.hasOwn(STATIC_BLOCKS, key) ? STATIC_BLOCKS[key] : undefined;
}

export function help() {
  const lines = ["available commands:"];
  for (const [cmd, desc] of Object.entries(ADVERTISED_COMMANDS)) {
    lines.push(`  ${cmd.padEnd(14)} ${desc}`);
  }
  return lines.join("\n");
}

export const MS_PER_MIN = 60000;
export const MIN_PER_HOUR = 60;
export const MIN_PER_DAY = 1440;

// Mirror real `uptime`: minutes only while under an hour into the current day
// ("up 5 min", "up 1 day, 5 min"), H:MM once an hour in ("up 3:07"), with a
// leading "D day(s)," past a day. Clamp negatives so a backwards clock (or a
// checkout whose LAST_DEPLOY is still in the future) can't print "up -1 days".
export function formatUptime(ms) {
  const totalMins = Math.max(0, Math.floor(ms / MS_PER_MIN));
  const days = Math.floor(totalMins / MIN_PER_DAY);
  const hours = Math.floor((totalMins % MIN_PER_DAY) / MIN_PER_HOUR);
  const mins = totalMins % MIN_PER_HOUR;
  const dayPrefix = days > 0 ? `${days} ${days === 1 ? "day" : "days"}, ` : "";
  // Like real `uptime`, the minutes-only form applies whenever the hour
  // component is zero, even when a day prefix is present.
  if (hours === 0) {
    return `up ${dayPrefix}${mins} min`;
  }
  return `up ${dayPrefix}${hours}:${String(mins).padStart(2, "0")}`;
}

// Handle the commands terminal.js doesn't render as a block. A few produce real
// output (sudo's lecture, a bare ls listing, uptime, date, echo); the rest get
// the denial that fits: privileged → permission denied, otherwise bash's own
// naming for an unknown command (see unknownCommand).

// A Set, not a plain object: a plain object would match inherited
// Object.prototype members (toString, constructor, …) as commands. Kept at
// module scope to avoid reallocating the Set on every command execution.
const PRIV = new Set(["su", "doas", "chmod", "chown"]);

// The commands that produce real output, as name → handler(argv) returning its
// stdout. A table, like STATIC_BLOCKS/ADVERTISED_COMMANDS, so the working set is
// data in one place rather than a chain of equality branches; dispatch below
// uses Object.hasOwn so an inherited member name (constructor, toString) can't
// match a handler. Exported so the help/dispatch drift guard binds to the real
// table (Object.keys) rather than scraping this file's source text.
export const HANDLERS = {
  sudo: () =>
    [
      "We trust you have received the usual lecture from the local System",
      "Administrator. It usually boils down to these three things:",
      "",
      "    #1) Respect the privacy of others.",
      "    #2) Think before you type.",
      "    #3) With great power comes great responsibility.",
      "",
      "guest is not in the sudoers file.  This incident will be reported.",
    ].join("\n"),
  ls: (argv) =>
    argv.length < 2
      ? "projects/ whoami.sh"
      : "ls: " + argv.slice(1).join(" ") + ": No such file or directory",
  uptime: () => formatUptime(Date.now() - LAST_DEPLOY),
  date: () => new Date().toString(),
  echo: (argv) => argv.slice(1).join(" "),
};

// Deny an unknown command the way bash names the failure — its own rule, not an
// arbitrary check: a command name containing a slash is a pathname bash tries to
// exec directly, so a missing one is "No such file or directory", while a bare
// word is searched on PATH, so it's "command not found". Keyed on the command
// name only; a working command's own path operands (ls projects/) are handled
// in HANDLERS above before this is reached.
function unknownCommand(name) {
  return name.includes("/")
    ? "bash: " + name + ": No such file or directory"
    : "bash: " + name + ": command not found";
}

export function reply(cmd) {
  const cleanCmd = cmd.trim();
  if (!cleanCmd) return "";
  const argv = cleanCmd.split(/\s+/);
  const name = argv[0];
  if (PRIV.has(name)) return name + ": permission denied";
  if (Object.hasOwn(HANDLERS, name)) return HANDLERS[name](argv);
  return unknownCommand(name);
}
