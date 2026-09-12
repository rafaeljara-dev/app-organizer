import { readFile } from "node:fs/promises";
import { extname, join } from "node:path";
import { chromium } from "playwright";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const OUT = "out";
const ORIGIN = "http://estante.local";
const BASE = "/app-organizer";
const SHOTS = process.argv[2] ?? "/tmp/shots";
const TYPES = { ".html":"text/html", ".js":"text/javascript", ".css":"text/css", ".json":"application/json",
  ".webmanifest":"application/manifest+json", ".png":"image/png", ".svg":"image/svg+xml",
  ".woff2":"font/woff2", ".txt":"text/plain" };

const browser = await chromium.launch({ executablePath: CHROME });

async function openPage(opts) {
  const ctx = await browser.newContext(opts);
  await ctx.route(`${ORIGIN}/**`, async (route) => {
    const url = new URL(route.request().url());
    let rel = url.pathname.startsWith(BASE) ? url.pathname.slice(BASE.length) : url.pathname;
    if (rel === "" || rel.endsWith("/")) rel += "index.html";
    try {
      const body = await readFile(join(OUT, rel));
      await route.fulfill({ status: 200, body, headers: { "content-type": TYPES[extname(rel)] ?? "application/octet-stream" } });
    } catch {
      await route.fulfill({ status: 404, body: "not found" });
    }
  });
  const page = await ctx.newPage();
  const errs = [];
  page.on("pageerror", (e) => errs.push(String(e).slice(0, 200)));
  page.on("console", (m) => { if (m.type() === "error") errs.push(m.text().slice(0, 200)); });
  await page.goto(`${ORIGIN}${BASE}/`, { waitUntil: "networkidle" });
  await page.waitForTimeout(900);
  return { ctx, page, errs };
}

const phone = { viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, hasTouch: true, isMobile: true };

// 1. light, at rest
{
  const { ctx, page, errs } = await openPage({ ...phone, colorScheme: "light" });
  await page.screenshot({ path: `${SHOTS}/01-light.png` });
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth > innerWidth + 1);
  console.log("light      errors:", errs.length ? errs : "none", "| hscroll:", overflow);
  await ctx.close();
}
// 2. dark, at rest
{
  const { ctx, page, errs } = await openPage({ ...phone, colorScheme: "dark" });
  await page.screenshot({ path: `${SHOTS}/02-dark.png` });
  console.log("dark       errors:", errs.length ? errs : "none");
  await ctx.close();
}
// 3. search expanded
{
  const { ctx, page, errs } = await openPage({ ...phone, colorScheme: "light" });
  await page.click(".searchbtn");
  await page.waitForTimeout(750);
  await page.screenshot({ path: `${SHOTS}/03-search.png` });
  console.log("search     errors:", errs.length ? errs : "none");
  await ctx.close();
}
// 4. settings sheet
{
  const { ctx, page, errs } = await openPage({ ...phone, colorScheme: "light" });
  await page.click('button[aria-label="Ajustes"]');
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/04-settings.png` });
  console.log("settings   errors:", errs.length ? errs : "none");
  await ctx.close();
}
// 5. list view, dark
{
  const { ctx, page, errs } = await openPage({ ...phone, colorScheme: "dark" });
  await page.click('button[aria-label="Ajustes"]');
  await page.waitForTimeout(600);
  await page.locator(".seg button", { hasText: /^Lista$/ }).first().click({ force: true });
  await page.waitForTimeout(300);
  await page.keyboard.press("Escape");
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${SHOTS}/05-list-dark.png` });
  console.log("list       errors:", errs.length ? errs : "none");
  await ctx.close();
}
// 6. desktop
{
  const { ctx, page, errs } = await openPage({ viewport: { width: 1200, height: 860 }, deviceScaleFactor: 1.5, colorScheme: "light" });
  await page.screenshot({ path: `${SHOTS}/06-desktop.png` });
  console.log("desktop    errors:", errs.length ? errs : "none");
  await ctx.close();
}
await browser.close();
