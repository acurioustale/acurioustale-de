import { test } from "node:test";
import assert from "node:assert/strict";

import {
  reply,
  help,
  blockFor,
  formatUptime,
  MS_PER_MIN,
  MIN_PER_HOUR,
  MIN_PER_DAY,
} from "../js/commands.js";

test("privileged commands are denied with permission denied", () => {
  for (const cmd of ["su", "doas", "chmod", "chown"]) {
    assert.equal(reply(cmd), cmd + ": permission denied");
    // The denial names the bare command, ignoring any arguments.
    assert.equal(reply(cmd + " -R /"), cmd + ": permission denied");
  }
});

test("sudo returns the classic lecture and incident report", () => {
  const res = reply("sudo su");
  assert.match(res, /We trust you have received the usual lecture/);
  assert.match(
    res,
    /guest is not in the sudoers file\. {2}This incident will be reported\./,
  );
});

test("blockFor resolves the static blocks and tolerates a trailing slash only after a directory", () => {
  // Exact matches resolve to their block selectors.
  assert.equal(blockFor("./whoami.sh"), ".whoami");
  assert.equal(blockFor("ls projects"), ".projects");
  // A trailing slash is meaningful only after the `ls ` directory operand.
  assert.equal(blockFor("ls projects/"), ".projects");
  assert.equal(blockFor("ls projects///"), ".projects");
  // A file with a trailing slash is an error, not a re-run.
  assert.equal(blockFor("./whoami.sh/"), undefined);
  // Non-block commands (including a bare ls and an unknown ls operand) don't match.
  assert.equal(blockFor("ls"), undefined);
  assert.equal(blockFor("ls nope"), undefined);
  assert.equal(blockFor("whoami"), undefined);
  // Inherited Object member names must not resolve to a block.
  assert.equal(blockFor("constructor"), undefined);
  assert.equal(blockFor("toString"), undefined);
});

test("a bare ls lists projects/ and whoami.sh", () => {
  assert.equal(reply("ls"), "projects/ whoami.sh");
});

test("ls of any other path errors like real ls", () => {
  assert.equal(reply("ls foo"), "ls: foo: No such file or directory");
  assert.equal(reply("ls a b"), "ls: a b: No such file or directory");
});

test("uptime returns calculated uptime string", () => {
  assert.match(reply("uptime"), /^up \d/);
});

// formatUptime is pure, so exercise every branch directly — reply("uptime")
// alone only ever hits one form (whatever the real elapsed time happens to be).
const MIN = MS_PER_MIN;
const HOUR = MIN_PER_HOUR * MIN;
const DAY = MIN_PER_DAY * MIN;

test("formatUptime shows minutes only under an hour", () => {
  assert.equal(formatUptime(0), "up 0 min");
  assert.equal(formatUptime(5 * MIN), "up 5 min");
  assert.equal(formatUptime(59 * MIN), "up 59 min");
});

test("formatUptime switches to H:MM at an hour, zero-padding minutes", () => {
  assert.equal(formatUptime(HOUR), "up 1:00");
  assert.equal(formatUptime(3 * HOUR + 7 * MIN), "up 3:07");
  assert.equal(formatUptime(23 * HOUR + 59 * MIN), "up 23:59");
});

test("formatUptime prefixes the day count, singular and plural", () => {
  assert.equal(formatUptime(DAY + 3 * HOUR + 4 * MIN), "up 1 day, 3:04");
  assert.equal(formatUptime(2 * DAY + 13 * HOUR), "up 2 days, 13:00");
});

test("formatUptime keeps the minutes-only form past a day when the hour is 0", () => {
  // The regression this guards: it must read "up 1 day, 5 min", not "0:05".
  assert.equal(formatUptime(DAY + 5 * MIN), "up 1 day, 5 min");
  assert.equal(formatUptime(2 * DAY), "up 2 days, 0 min");
});

test("formatUptime clamps a negative (backwards clock) to up 0 min", () => {
  assert.equal(formatUptime(-5 * MIN), "up 0 min");
  assert.equal(formatUptime(-DAY), "up 0 min");
});

test("date returns a Date.toString()-style string", () => {
  // Assert the actual shape (weekday, month, day, year, time, GMT offset) so a
  // broken date branch can't slip through, rather than just a length bound any
  // non-empty string would clear.
  assert.match(
    reply("date"),
    /^(Mon|Tue|Wed|Thu|Fri|Sat|Sun) (Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec) \d{2} \d{4} \d{2}:\d{2}:\d{2} GMT[+-]\d{4}/,
  );
});

test("echo echoes back arguments", () => {
  assert.equal(reply("echo hello world"), "hello world");
  assert.equal(reply("echo"), "");
});

test("a path-like command reports no such file, naming the executable path", () => {
  assert.equal(reply("./run.sh"), "bash: ./run.sh: No such file or directory");
  assert.equal(
    reply("/usr/bin/custom"),
    "bash: /usr/bin/custom: No such file or directory",
  );
});

test("anything else is command not found", () => {
  assert.equal(reply("cat /etc/passwd"), "bash: cat: command not found");
  assert.equal(reply("whoami"), "bash: whoami: command not found");
  assert.equal(reply("vim foo"), "bash: vim: command not found");
});

test("empty command returns empty string", () => {
  assert.equal(reply(""), "");
  assert.equal(reply("   "), "");
});

// help() must list every command that terminal.js actually handles, so the
// listing can't drift out of sync with what the prompt accepts.
test("help lists each advertised command", () => {
  const text = help();
  assert.match(text, /^available commands:/);
  for (const cmd of ["ls", "uptime", "date", "sudo", "echo", "clear", "help"]) {
    assert.ok(text.includes(cmd), `help should mention ${cmd}`);
  }
});

// whoami.sh and projects/ are filesystem entries discovered via `ls` and run
// directly, not advertised commands, so help() must not list them.
test("help does not advertise the discoverable filesystem entries", () => {
  const text = help();
  assert.ok(!text.includes("whoami.sh"), "help should not list whoami.sh");
  assert.ok(!text.includes("projects/"), "help should not list projects/");
});

// Regression guard for the array-not-object choice in reply(): inherited
// Object.prototype member names must not be treated as known commands.
test("Object.prototype member names are command not found, not privileged", () => {
  for (const cmd of ["toString", "constructor", "hasOwnProperty"]) {
    assert.equal(reply(cmd), "bash: " + cmd + ": command not found");
  }
});

import { ADVERTISED_COMMANDS, STATIC_BLOCKS } from "../js/commands.js";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";

// These cross-checks bind help()'s listing to the commands the code actually
// dispatches, so the two can't drift. Rather than hand-maintain a list of those
// commands (which silently goes stale the moment terminal.js gains a branch),
// derive it from the source: the literals terminal.js special-cases in its run()
// dispatch (cmd === "...") and the ones commands.js reply() produces real output
// for (argv[0] === "..."). The privileged denials sit in a Set, matched with
// .has() rather than an equality check, so they're correctly left out.
const readSrc = (rel) =>
  readFileSync(fileURLToPath(new URL(rel, import.meta.url)), "utf8");

const literals = (src, re) => new Set([...src.matchAll(re)].map((m) => m[1]));

const terminalHandled = literals(
  readSrc("../js/terminal.js"),
  /\bcmd === "([^"]+)"/g,
);
const replyHandled = literals(
  readSrc("../js/commands.js"),
  /argv\[0\] === "([^"]+)"/g,
);

// The filesystem entries you discover with `ls` and run directly (`./whoami.sh`,
// `ls projects`) — unadvertised, handled by terminal.js via STATIC_BLOCKS.
const ALIASES = new Set(Object.keys(STATIC_BLOCKS));

// Every command dispatched across the two modules (aliases aside).
const dispatched = new Set([...terminalHandled, ...replyHandled]);

const advertised = Object.keys(ADVERTISED_COMMANDS);

// Guard the derivation itself: if a refactor changes how the modules dispatch
// so the regexes match nothing, the sets would be empty and the cross-checks
// below would pass vacuously — fail loudly instead so the regex gets updated.
test("the dispatch sets are derived from the modules and non-empty", () => {
  assert.ok(
    terminalHandled.size > 0,
    'extracted no `cmd === "..."` from terminal.js - update the dispatch regex',
  );
  assert.ok(
    replyHandled.size > 0,
    'extracted no `argv[0] === "..."` from commands.js - update the dispatch regex',
  );
});

test("every command help() lists is actually dispatched by terminal.js or commands.js", () => {
  for (const cmd of advertised) {
    assert.ok(
      dispatched.has(cmd),
      `help() lists "${cmd}" but it is not handled`,
    );
  }
});

test("every command terminal.js or commands.js dispatches is listed by help() (aliases aside)", () => {
  for (const cmd of dispatched) {
    if (ALIASES.has(cmd)) continue;
    assert.ok(
      advertised.includes(cmd),
      `"${cmd}" is handled but help() omits it`,
    );
  }
});
