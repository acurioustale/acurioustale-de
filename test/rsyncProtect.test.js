import { test } from "node:test";
import assert from "node:assert/strict";
import { readFile, mkdtemp, mkdir, writeFile, readdir } from "node:fs/promises";
import { execFile } from "node:child_process";
import { promisify } from "node:util";
import { tmpdir } from "node:os";
import { join } from "node:path";

// Bind deploy.sh's `protect` filters to what rsync --delete actually does with
// them. The deploy mirrors a staged tree onto the web root with --delete, so
// everything in the root that the staging directory does not hold is pruned —
// including the ACME challenge files a cert renewal drops into `.well-known/`,
// which the HOST owns and this repo never stages. The filters are the only
// thing standing between a routine deploy and a broken cert renewal, and their
// correctness is not obvious from reading them: a single `protect
// /.well-known/` is enough only while the directory is absent from the
// transfer. Since we ship `.well-known/security.txt`, rsync descends into the
// directory and prunes extraneous entries inside it, so the entries need a rule
// of their own. Nothing else in the gate exercises rsync, and the live failure
// would surface on a cert renewal weeks after the edit.
//
// So this test pulls the ACTUAL filter arguments out of deploy.sh (owning no
// copy of its own, so it stays a true binding of the two) and runs a real local
// rsync with them over a temporary source/destination pair. rsync is a hard
// requirement here rather than a skip: deploy.sh cannot run without it either.

const run = promisify(execFile);
const root = new URL("../", import.meta.url);
const deploySh = await readFile(new URL("deploy.sh", root), "utf8");

// The body of the `rsync_protect=( ... )` array, then every single-quoted
// --filter argument inside it, in file order.
const ARRAY_BODY = /\brsync_protect=\(([\s\S]*?)\n\)/;
const FILTER_ARG = /--filter='([^']*)'/g;

const body = deploySh.match(ARRAY_BODY);
assert.ok(body, "deploy.sh no longer defines an rsync_protect=( ... ) array");

const filters = [...body[1].matchAll(FILTER_ARG)].map(
  ([, rule]) => `--filter=${rule}`,
);
assert.ok(
  filters.length > 0,
  "rsync_protect holds no --filter='...' arguments",
);

test("deploy.sh's protect filters keep --delete off the host's .well-known/", async () => {
  const base = await mkdtemp(join(tmpdir(), "rsync-protect-"));
  const src = join(base, "src");
  const dest = join(base, "dest");

  // The staged tree: the site, including the one .well-known/ file we own.
  await mkdir(join(src, ".well-known"), { recursive: true });
  await writeFile(join(src, "index.html"), "new\n");
  await writeFile(join(src, ".well-known", "security.txt"), "Contact: new\n");

  // The two revisions of each file differ in LENGTH on purpose: rsync's
  // quick check is size plus mtime, so same-sized files written in the same
  // second are skipped as unchanged and the "still updates" assertions below
  // would pass without anything having transferred.

  // The web root as the host leaves it: our files at an older revision, an ACME
  // challenge the host placed, and one out-of-band file that SHOULD be pruned.
  await mkdir(join(dest, ".well-known", "acme-challenge"), { recursive: true });
  await writeFile(join(dest, "index.html"), "the older one\n");
  await writeFile(
    join(dest, ".well-known", "security.txt"),
    "Contact: the older one\n",
  );
  await writeFile(
    join(dest, ".well-known", "acme-challenge", "token"),
    "challenge\n",
  );
  await writeFile(join(dest, "stray.html"), "out of band\n");

  await run("rsync", ["-a", "--delete", ...filters, `${src}/`, `${dest}/`]);

  // The challenge survives: protect is what this fix is about.
  assert.deepEqual(await readdir(join(dest, ".well-known", "acme-challenge")), [
    "token",
  ]);

  // protect is a delete-time filter only, so our own file still updates.
  assert.equal(
    await readFile(join(dest, ".well-known", "security.txt"), "utf8"),
    "Contact: new\n",
  );
  assert.equal(await readFile(join(dest, "index.html"), "utf8"), "new\n");

  // And the rest of the root is still an exact mirror.
  assert.deepEqual((await readdir(dest)).sort(), [".well-known", "index.html"]);
});
