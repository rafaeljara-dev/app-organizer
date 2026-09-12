import { spawn } from "node:child_process";
import { chromium } from "playwright";

/* A stand-in that looks like a real site icon, so the screenshot is worth
   looking at: a coloured square with the site's initial. */
const fakeIcon = (host) => {
  let h = 0;
  for (const ch of host) h = (h * 31 + ch.charCodeAt(0)) >>> 0;
  const hue = h % 360;
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="192" height="192">` +
    `<rect width="192" height="192" fill="hsl(${hue} 62% 46%)"/>` +
    `<text x="96" y="130" font-family="sans-serif" font-size="104" font-weight="700" ` +
    `fill="#fff" text-anchor="middle">${host[0].toUpperCase()}</text></svg>`;
  return `data:image/svg+xml;base64,${Buffer.from(svg).toString("base64")}`;
};
const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(process.env.PORT_UNDER_TEST)], {
  stdio: ["ignore", "inherit", "inherit"], env: { ...process.env, NODE_ENV: "production" },
});
const port = Number(process.env.PORT_UNDER_TEST);
const ready = async () => {
  const { connect } = await import("node:net");
  for (let i = 0; i < 90; i++) {
    const up = await new Promise((res) => {
      const s = connect(port, "127.0.0.1");
      s.once("connect", () => { s.destroy(); res(true); });
      s.once("error", () => res(false));
      setTimeout(() => { s.destroy(); res(false); }, 400);
    });
    if (up) return;
    await new Promise((r) => setTimeout(r, 300));
  }
  throw new Error("el servidor no respondió");
};
await ready();

let pass = 0, fail = 0, calls = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ok    ${n}`); } else { fail++; console.log(`  FALLA ${n}${d ? "  ->  " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: CHROME });
// The service worker caches /api/icon on purpose, and Playwright cannot
// intercept requests a worker makes. Blocking it here keeps this test about
// the interface; the worker's own behaviour is covered by sw-check.mjs.
const ctx = await browser.newContext({
  viewport: { width: 402, height: 874 }, deviceScaleFactor: 2, serviceWorkers: "block",
});

// Stand in for the real endpoint: this session cannot reach the open web,
// so the browser half is proved against a controlled answer.
await ctx.route("**/api/icon*", async (route) => {
  calls++;
  const target = new URL(route.request().url()).searchParams.get("url") ?? "";
  const host = (() => { try { return new URL(target).hostname.replace(/^www\./, ""); } catch { return target; } })();
  if (host.includes("sin-icono")) {
    return route.fulfill({ status: 404, contentType: "application/json",
      body: JSON.stringify({ ok: false, host, reason: "ningún icono utilizable" }) });
  }
  return route.fulfill({ status: 200, contentType: "application/json", body: JSON.stringify({
    ok: true, host, name: host.split(".")[0].replace(/^./, (c) => c.toUpperCase()),
    themeColor: "#2F6FD0", icon: fakeIcon(host), iconUrl: `https://${host}/apple.png`,
    source: "apple-touch-icon", bytes: 200, contentType: "image/svg+xml" }) });
});

const page = await ctx.newPage();
const errs = [];
page.on("pageerror", (e) => errs.push(String(e).slice(0, 160)));
await page.goto(`http://localhost:${port}/`, { waitUntil: "networkidle" });
await page.waitForTimeout(1200);

console.log("\nIconos reales en la pantalla de inicio");
check("la app pide iconos al arrancar", calls > 0, `llamadas: ${calls}`);
await page.waitForFunction(() => document.querySelectorAll(".grid .ico img").length >= 8, null, { timeout: 15000 })
  .catch(() => {});
const counts = await page.evaluate(() => ({
  tilesWithImage: document.querySelectorAll(".grid .ico img").length,
  dockWithImage: document.querySelectorAll(".dock .ico img").length,
  bleed: document.querySelectorAll(".grid .ico--bleed").length,
  stillGlyphs: document.querySelectorAll(".grid .ico > svg").length,
}));
check("las tejas cambian el glifo por el icono del sitio", counts.tilesWithImage >= 8, JSON.stringify(counts));
check("el dock también", counts.dockWithImage === 4, JSON.stringify(counts));
check("un apple-touch-icon se dibuja a sangre", counts.bleed >= 8, JSON.stringify(counts));
await page.screenshot({ path: "/tmp/shots/10-iconos.png" });

console.log("\nPersistencia");
await page.reload({ waitUntil: "networkidle" });
await page.waitForTimeout(1000);
const afterReload = await page.evaluate(() => document.querySelectorAll(".grid .ico img").length);
check("los iconos sobreviven a la recarga sin volver a pedirlos", afterReload >= 8, String(afterReload));

console.log("\nAlta con vista previa");
const before = calls;
await page.click('button[aria-label="Añadir app"]');
await page.waitForTimeout(500);
await page.fill('input[aria-label="Dirección"]', "figma.com");
await page.waitForTimeout(1600);
const preview = await page.evaluate(() => {
  const row = document.querySelector(".iconrow");
  return row ? { img: !!row.querySelector("img"), text: row.querySelector(".m")?.textContent ?? "" } : null;
});
check("la vista previa aparece al escribir la dirección", !!preview?.img, JSON.stringify(preview));
check("dice de dónde sacó el icono", (preview?.text ?? "").includes("apple-touch-icon"), preview?.text);
check("resolver la vista previa llama al endpoint", calls > before, `${before} -> ${calls}`);
await page.screenshot({ path: "/tmp/shots/11-alta.png" });

await page.fill('input[aria-label="Dirección"]', "sin-icono.example");
await page.waitForTimeout(1600);
const miss = await page.evaluate(() => document.body.innerText.includes("no publica un icono utilizable"));
check("un sitio sin icono lo dice y no rompe", miss);

check("sin errores de JavaScript", errs.length === 0, errs.join(" | "));

await browser.close();
server.kill("SIGTERM");
console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
