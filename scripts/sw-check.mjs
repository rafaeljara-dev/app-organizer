import { createServer } from "node:http";
import { readFile, stat } from "node:fs/promises";
import { extname, join, normalize } from "node:path";
import { chromium } from "playwright";

const TYPES = { ".html":"text/html",".js":"text/javascript",".css":"text/css",".json":"application/json",
  ".webmanifest":"application/manifest+json",".png":"image/png",".svg":"image/svg+xml",".woff2":"font/woff2",".txt":"text/plain" };

const server = createServer(async (req, res) => {
  const url = decodeURIComponent((req.url ?? "/").split("?")[0]);
  let p = join(".preview", normalize(url).replace(/^(\.\.[/\\])+/, ""));
  try { if ((await stat(p)).isDirectory()) p = join(p, "index.html"); } catch {}
  try {
    const body = await readFile(p);
    res.writeHead(200, { "content-type": TYPES[extname(p)] ?? "application/octet-stream" });
    res.end(body);
  } catch { res.writeHead(404); res.end("nf"); }
});
await new Promise((r) => server.listen(8120, "127.0.0.1", r));

const browser = await chromium.launch({ executablePath: "/opt/pw-browsers/chromium-1194/chrome-linux/chrome" });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: "allow" });
const page = await ctx.newPage();
const base = "http://localhost:8120/app-organizer/";

await page.goto(base, { waitUntil: "networkidle" });
const reg = await page.evaluate(async () => {
  const r = await navigator.serviceWorker.register("/app-organizer/sw.js", { scope: "/app-organizer/" }).catch((e) => String(e));
  if (typeof r === "string") return { ok: false, why: r };
  await navigator.serviceWorker.ready;
  return { ok: true, scope: r.scope, active: !!r.active };
});
console.log("registro:", reg);

await page.waitForTimeout(3000);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  let total = 0;
  for (const n of names) total += (await (await caches.open(n)).keys()).length;
  return { names, total };
});
console.log("cachés:", cached);

// Now cut the network entirely and reload.
await ctx.setOffline(true);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1500);
const offline = await page.evaluate(() => ({
  tiles: document.querySelectorAll(".grid .ico").length,
  dock: document.querySelectorAll(".dock .ico").length,
  title: document.title,
}));
console.log("sin red:", offline);
await page.screenshot({ path: "/tmp/shots/07-offline.png" });

await browser.close();
server.close();
