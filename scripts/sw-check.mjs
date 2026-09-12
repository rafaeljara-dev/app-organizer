import { spawn } from "node:child_process";
import { chromium } from "playwright";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";
const port = Number(process.env.PORT_UNDER_TEST ?? 3400);

const server = spawn("node", ["node_modules/next/dist/bin/next", "start", "-p", String(port)], {
  stdio: ["ignore", "inherit", "inherit"],
});
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

let pass = 0, fail = 0;
const check = (n, c, d = "") => { if (c) { pass++; console.log(`  ok    ${n}`); } else { fail++; console.log(`  FALLA ${n}${d ? "  ->  " + d : ""}`); } };

const browser = await chromium.launch({ executablePath: CHROME });
const ctx = await browser.newContext({ viewport: { width: 402, height: 874 }, serviceWorkers: "allow" });
const page = await ctx.newPage();
const base = `http://localhost:${port}/`;

await page.goto(base, { waitUntil: "networkidle" });
const reg = await page.evaluate(async () => {
  await navigator.serviceWorker.ready;
  const r = await navigator.serviceWorker.getRegistration();
  return { scope: r?.scope ?? null, active: !!r?.active };
});
console.log("\nService worker");
check("se registra en la raíz del sitio", reg.scope === base, String(reg.scope));
check("queda activo", reg.active);

await page.waitForTimeout(3500);
const cached = await page.evaluate(async () => {
  const names = await caches.keys();
  let total = 0;
  for (const n of names) total += (await (await caches.open(n)).keys()).length;
  return { names, total };
});
check("precachea el armazón", cached.total > 10, JSON.stringify(cached));

console.log("\nSin red");
await ctx.setOffline(true);
await page.reload({ waitUntil: "load" });
await page.waitForTimeout(1800);
const offline = await page.evaluate(() => ({
  tiles: document.querySelectorAll(".grid .ico").length,
  dock: document.querySelectorAll(".dock .ico").length,
  title: document.title,
}));
check("la app arranca sin conexión", offline.tiles > 10 && offline.dock === 4, JSON.stringify(offline));
check("conserva el título", offline.title === "Estante");
await page.screenshot({ path: "/tmp/shots/12-offline.png" });

await browser.close();
server.kill("SIGTERM");
console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
