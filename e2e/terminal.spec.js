import { test, expect } from "@playwright/test";

// These cover only what needs a real layout engine and computed styles — the
// behaviour jsdom can't verify. The DOM wiring (echo, dispatch, clear, recall,
// cap) is covered by test/terminalDom.test.js; this is the in-browser layer.

test("enables the command input on a desktop (fine pointer)", async ({
  page,
}) => {
  await page.goto("/");
  // The whole feature is gated on matchMedia("(pointer: fine)"), which only a
  // real browser resolves; on desktop Chrome the input is injected.
  await expect(page.locator(".cmd-input")).toBeVisible();
});

test("freezes the screen height so history scrolls instead of growing the card", async ({
  page,
}) => {
  await page.goto("/");
  const screen = page.locator(".screen");
  const before = (await screen.boundingBox()).height;

  const input = page.locator(".cmd-input");
  for (let i = 0; i < 40; i++) {
    await input.fill("help");
    await input.press("Enter");
  }

  // fitScreen pinned the height at load; the flood of output must not have
  // grown the card.
  const after = (await screen.boundingBox()).height;
  expect(Math.abs(after - before)).toBeLessThan(2);

  // Instead it overflows and scrolls inside the frozen viewport.
  const overflow = await screen.evaluate(
    (el) => el.scrollHeight > el.clientHeight,
  );
  expect(overflow).toBe(true);
});

test("grows the input width as it is typed", async ({ page }) => {
  await page.goto("/");
  const input = page.locator(".cmd-input");

  await input.fill("x");
  const narrow = (await input.boundingBox()).width;
  await input.fill("x".repeat(60));
  const wide = (await input.boundingBox()).width;

  // The ghost-span measurement must widen the field with its content so the
  // block cursor trails the text.
  expect(wide).toBeGreaterThan(narrow);
});

test("the input never scrolls its own text out of view", async ({ page }) => {
  await page.goto("/");
  const input = page.locator(".cmd-input");
  await input.click();
  await page.keyboard.type("help");

  // WebKit keeps room for the caret after the last glyph; a field sized to the
  // bare text scrolls by that much and clips the first letter.
  const fit = await input.evaluate((el) => ({
    scrollLeft: el.scrollLeft,
    overflow: el.scrollWidth - el.clientWidth,
  }));
  expect(fit).toEqual({ scrollLeft: 0, overflow: 0 });
});

test("clicking the terminal focuses the input", async ({ page }) => {
  await page.goto("/");
  await page.locator(".screen").click({ position: { x: 5, y: 5 } });
  await expect(page.locator(".cmd-input")).toBeFocused();
});

test("clicking to focus keeps the scrollback position", async ({ page }) => {
  await page.goto("/");
  const input = page.locator(".cmd-input");
  for (let i = 0; i < 40; i++) {
    await input.fill("help");
    await input.press("Enter");
  }

  const screen = page.locator(".screen");
  // Move focus off the input and scroll back up to read earlier output.
  await input.blur();
  await screen.evaluate((el) => (el.scrollTop = 0));

  // A plain click (nothing selected, not a link) refocuses the prompt but must
  // not scroll the frozen viewport back down to it.
  await screen.click({ position: { x: 5, y: 5 } });
  await expect(input).toBeFocused();
  expect(await screen.evaluate((el) => el.scrollTop)).toBeLessThan(5);
});

test("the theme toggle changes the rendered background colour", async ({
  page,
}) => {
  await page.goto("/");
  const bodyBg = () =>
    page.evaluate(() => getComputedStyle(document.body).backgroundColor);
  const toggle = page.locator(".theme-toggle");
  await expect(toggle).toBeVisible();

  // Walk the whole three-way cycle; forcing light vs dark must resolve the
  // light-dark() --page-bg token to different colours (jsdom can't do this).
  const seen = new Set([await bodyBg()]);
  for (let i = 0; i < 3; i++) {
    await toggle.click();
    seen.add(await bodyBg());
  }
  expect(seen.size).toBeGreaterThan(1);
});
