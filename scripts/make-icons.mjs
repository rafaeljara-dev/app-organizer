import { mkdir } from "node:fs/promises";
import { chromium } from "playwright";

const CHROME = "/opt/pw-browsers/chromium-1194/chrome-linux/chrome";

/** @param {{size:number, radius:string, pad:number}} o */
const html = ({ radius, pad }) => `
<style>
  html,body{margin:0;height:100%;background:transparent}
  .plate{
    position:absolute; inset:0; border-radius:${radius};
    background:
      radial-gradient(120% 100% at 28% 8%, #2FA79B 0%, transparent 58%),
      linear-gradient(150deg, #148C83 0%, #0E7C74 46%, #0A5852 100%);
    box-shadow: inset 0 4% 0 0 rgba(255,255,255,.28);
    overflow:hidden;
  }
  .plate::after{
    content:''; position:absolute; left:-10%; top:-40%; width:120%; height:70%;
    background:linear-gradient(180deg, rgba(255,255,255,.34), transparent);
    transform:rotate(-8deg); filter:blur(6px);
  }
  .grid{
    position:absolute; inset:${pad}%;
    display:grid; grid-template-columns:1fr 1fr; grid-template-rows:1fr 1fr; gap:10%;
  }
  .grid i{ border-radius:24%; background:rgba(255,255,255,.62); }
  .grid i:first-child{ background:#fff; }
</style>
<div class="plate"><div class="grid"><i></i><i></i><i></i><i></i></div></div>
`;

await mkdir("public/icons", { recursive: true });
const browser = await chromium.launch({ executablePath: CHROME });

const jobs = [
  { file: "public/icons/icon-192.png", size: 192, radius: "23%", pad: 26, alpha: true },
  { file: "public/icons/icon-512.png", size: 512, radius: "23%", pad: 26, alpha: true },
  { file: "public/icons/icon-maskable-512.png", size: 512, radius: "0", pad: 32, alpha: false },
  { file: "public/icons/apple-touch-icon.png", size: 180, radius: "0", pad: 26, alpha: false },
  { file: "public/icons/favicon.png", size: 64, radius: "23%", pad: 24, alpha: true },
];

for (const j of jobs) {
  const ctx = await browser.newContext({ viewport: { width: j.size, height: j.size }, deviceScaleFactor: 1 });
  const page = await ctx.newPage();
  await page.setContent(html(j), { waitUntil: "load" });
  await page.screenshot({ path: j.file, omitBackground: j.alpha });
  await ctx.close();
  console.log(`${j.file}  ${j.size}px`);
}
await browser.close();
