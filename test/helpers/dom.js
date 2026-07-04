// Shared jsdom harness for the DOM-wiring tests (terminalDom / themeToggleDom).
// The pure logic is unit-tested directly (theme.js, commands.js, terminal-ui.js);
// this covers the glue those modules can't test on their own — that a click,
// keystroke or storage event actually mutates the DOM the way it should.
//
// It builds a document from the REAL index.html (so the tests see the shipping
// markup: the titlebar, the theme-color metas, the boot card), stubs the browser
// APIs jsdom doesn't implement, exposes the globals the browser modules read as
// bare identifiers, and dynamically imports the module under test with a unique
// query string so each test re-runs the module's top-level wiring against a
// fresh DOM.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { JSDOM } from "jsdom";

const html = readFileSync(
  fileURLToPath(new URL("../../index.html", import.meta.url)),
  "utf8",
);

let importCounter = 0;

// Build a fresh DOM, wire up the globals, and import the module so its top-level
// setup runs. Returns the window and document for assertions.
//   pointerFine       value reported for the "(pointer: fine)" query (terminal gate)
//   prefersLight      whether the OS prefers light (drives the theme cycle order)
//   legacyMatchMedia  omit addEventListener from the MediaQueryList to model
//                     Safari ≤13, whose MQL only has the deprecated addListener
//   noMatchMedia      omit window.matchMedia entirely, to model a browser that
//                     lacks it (the modules must degrade, not throw)
export async function loadModule(
  relPath,
  {
    pointerFine = true,
    prefersLight = false,
    legacyMatchMedia = false,
    noMatchMedia = false,
  } = {},
) {
  const dom = new JSDOM(html, {
    url: "https://acurioustale.de/",
    pretendToBeVisual: true, // provides requestAnimationFrame
  });
  const { window } = dom;

  // jsdom ships no matchMedia; the modules query pointer type and colour scheme.
  // noMatchMedia leaves it undefined to model a browser without the API.
  if (!noMatchMedia)
    window.matchMedia = (query) => {
      const mql = {
        matches: query.includes("pointer: fine")
          ? pointerFine
          : query.includes("prefers-color-scheme: light")
            ? prefersLight
            : query.includes("prefers-color-scheme: dark")
              ? !prefersLight
              : false,
        media: query,
        addListener() {},
        removeListener() {},
        dispatchEvent() {
          return false;
        },
      };
      // Modern browsers expose both APIs; Safari ≤13 only the deprecated one.
      if (!legacyMatchMedia) {
        mql.addEventListener = () => {};
        mql.removeEventListener = () => {};
      }
      return mql;
    };

  // The browser modules read these as bare identifiers (window.*, document,
  // localStorage). Leave CSS unset so terminal.js exercises its ghost-span
  // width fallback rather than the field-sizing path.
  global.window = window;
  global.document = window.document;
  global.localStorage = window.localStorage;
  global.requestAnimationFrame = window.requestAnimationFrame.bind(window);
  delete global.CSS;

  // Cache-bust so the module's top-level wiring runs against this fresh DOM.
  await import(
    new URL(`../../${relPath}?case=${importCounter++}`, import.meta.url)
  );
  return { window, document: window.document };
}
