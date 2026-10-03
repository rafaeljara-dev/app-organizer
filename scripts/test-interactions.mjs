import { closeSync, existsSync, mkdtempSync, openSync, readFileSync, rmSync } from "node:fs";
import { dirname, join } from "node:path";
import { execFileSync, spawnSync } from "node:child_process";
import { tmpdir } from "node:os";

const TARGET_URL = process.env.TEST_URL || "http://localhost:3000";
const SESSION = process.env.AGENT_BROWSER_TEST_SESSION || `organizer-regression-${process.pid}`;
const DB_NAME = "estante";
const STORE_NAME = "kv";
const BACKUP_KEY = "__organizer_regression_backup__";

const checks = [];
let backedUp = false;
let browserStarted = false;

function resolveAgentBrowser() {
  if (process.env.AGENT_BROWSER_BIN) return { command: process.env.AGENT_BROWSER_BIN, prefix: [] };
  if (process.platform !== "win32") return { command: "agent-browser", prefix: [] };

  const resolved = execFileSync("powershell.exe", [
    "-NoProfile",
    "-Command",
    "(Get-Command agent-browser).Path",
  ], { encoding: "utf8", windowsHide: true }).trim().split(/\r?\n/).pop();

  if (resolved && /\.ps1$/i.test(resolved)) {
    const binary = join(dirname(resolved), "node_modules", "agent-browser", "bin", "agent-browser-win32-x64.exe");
    if (existsSync(binary)) return { command: binary, prefix: [] };
    return { command: "powershell.exe", prefix: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-File", resolved] };
  }
  return { command: resolved || "agent-browser", prefix: [] };
}

const agentBrowser = resolveAgentBrowser();

function run(args, { input = undefined, allowFailure = false } = {}) {
  const temp = mkdtempSync(join(tmpdir(), "organizer-regression-"));
  const stdoutPath = join(temp, "stdout.txt");
  const stderrPath = join(temp, "stderr.txt");
  const stdoutFd = openSync(stdoutPath, "w");
  const stderrFd = openSync(stderrPath, "w");
  let result;
  try {
    result = spawnSync(agentBrowser.command, [...agentBrowser.prefix, ...args], {
      cwd: process.cwd(),
      env: { ...process.env },
      stdio: ["pipe", stdoutFd, stderrFd],
      input,
      windowsHide: true,
    });
  } finally {
    closeSync(stdoutFd);
    closeSync(stderrFd);
  }
  const output = `${readFileSync(stdoutPath, "utf8")}${readFileSync(stderrPath, "utf8")}`.trim();
  rmSync(temp, { recursive: true, force: true });
  if (!allowFailure && (result.error || result.status !== 0)) {
    throw new Error(`agent-browser ${args.join(" ")} (exit ${result.status ?? "spawn"})\n${output}`);
  }
  return output;
}

function pageEval(code) {
  const encoded = Buffer.from(code, "utf8").toString("base64");
  const raw = run(["--session", SESSION, "eval", "-b", encoded]);
  const value = JSON.parse(raw);
  if (typeof value !== "string") return value;
  try { return JSON.parse(value); } catch { return value; }
}

function record(name, pass, details = "") {
  checks.push({ name, pass, details });
  process.stdout.write(`${pass ? "PASS" : "FAIL"} ${name}${details ? ` — ${details}` : ""}\n`);
}

function check(name, valueOrFn) {
  try {
    const value = typeof valueOrFn === "function" ? valueOrFn() : valueOrFn;
    record(name, Boolean(value === undefined ? true : value));
    return value;
  } catch (error) {
    record(name, false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    return false;
  }
}

async function sleep(ms) {
  await new Promise((resolve) => setTimeout(resolve, ms));
}

function openDbCode(body) {
  return `(async()=>{
    const db=await new Promise((resolve,reject)=>{const request=indexedDB.open(${JSON.stringify(DB_NAME)});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    const store=()=>db.transaction(${JSON.stringify(STORE_NAME)},'readwrite').objectStore(${JSON.stringify(STORE_NAME)});
    ${body}
  })()`;
}

const fixture = {
  schemaVersion: 1,
  settings: { view: "grid", cols: 4, scale: 1, shape: "squircle", labels: "on", wp: "musgo", theme: "system", refract: "off" },
  dock: [],
  pages: [{
    id: "regression-page",
    name: "Regresión",
    items: [
      { id: "reg-app", type: "app", name: "Regresión App", url: "https://example.com/?organizer-regression=1", g: "globe", c: "#737970" },
      { id: "reg-folder", type: "folder", name: "Regresión Carpeta", g: "folder", c: "#737970", items: [
        { id: "reg-child", type: "app", name: "Hijo", url: "https://example.org/?organizer-regression=1", g: "globe", c: "#737970" },
      ] },
      { id: "reg-row", type: "app", name: "Regresión Fila", url: "https://example.net/?organizer-regression=1", g: "globe", c: "#737970" },
    ],
  }],
};

const backupAndSeed = openDbCode(`
    const read=await new Promise((resolve,reject)=>{const request=store().get('doc');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    await new Promise((resolve,reject)=>{const request=store().put(read,${JSON.stringify(BACKUP_KEY)});request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    await new Promise((resolve,reject)=>{const request=store().put(${JSON.stringify(fixture)},'doc');request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    JSON.stringify({ok:true});
`);

const restoreCode = openDbCode(`
    const backup=await new Promise((resolve,reject)=>{const request=store().get(${JSON.stringify(BACKUP_KEY)});request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    if (backup) await new Promise((resolve,reject)=>{const request=store().put(backup,'doc');request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    await new Promise((resolve,reject)=>{const request=store().delete(${JSON.stringify(BACKUP_KEY)});request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    JSON.stringify({restored:Boolean(backup)});
`);

function closeMenus() {
  run(["--session", SESSION, "press", "Escape"], { allowFailure: true });
}

function hold(id, pointerType, pointerId) {
  const selector = JSON.stringify(`[data-shortcut-id="${id}"]`);
  return pageEval(`(async()=>{
    const root=document.querySelector(${selector});
    if(!root) return JSON.stringify({error:'missing root'});
    const rect=root.getBoundingClientRect();
    root.dispatchEvent(new PointerEvent('pointerdown',{bubbles:true,pointerId:${pointerId},pointerType:${JSON.stringify(pointerType)},clientX:rect.left+rect.width/2,clientY:rect.top+rect.height/2,button:0}));
    await new Promise(resolve=>setTimeout(resolve,560));
    const dialog=document.querySelector('dialog[open].menu-dialog');
    return JSON.stringify({open:Boolean(dialog),label:dialog?.getAttribute('aria-label')||'',itemCount:dialog?.querySelectorAll('button,a').length||0});
  })()`);
}

function focusState() {
  return pageEval("JSON.stringify({tag:document.activeElement?.tagName||'',label:document.activeElement?.getAttribute('aria-label')||'',id:document.activeElement?.closest('[data-shortcut-id]')?.getAttribute('data-shortcut-id')||''})");
}

function setView(view) {
  const code = openDbCode(`
    const doc=await new Promise((resolve,reject)=>{const request=store().get('doc');request.onsuccess=()=>resolve(request.result);request.onerror=()=>reject(request.error)});
    doc.settings.view=${JSON.stringify(view)};
    await new Promise((resolve,reject)=>{const request=store().put(doc,'doc');request.onsuccess=resolve;request.onerror=()=>reject(request.error)});
    JSON.stringify({view:doc.settings.view});
  `);
  pageEval(code);
  run(["--session", SESSION, "open", TARGET_URL]);
  run(["--session", SESSION, "wait", "--text", "Regresión"]);
}

function tabData() {
  const parsed = JSON.parse(run(["--session", SESSION, "tab", "list", "--json"]));
  return parsed?.data?.tabs || [];
}

try {
  run(["--session", SESSION, "open", TARGET_URL]);
  browserStarted = true;
  run(["--session", SESSION, "wait", "--load", "networkidle"]);

  pageEval(backupAndSeed);
  backedUp = true;
  run(["--session", SESSION, "open", TARGET_URL]);
  run(["--session", SESSION, "wait", "--text", "Regresión"]);

  for (const width of [390, 320]) {
    run(["--session", SESSION, "set", "viewport", String(width), "844"]);
    const metrics = pageEval("JSON.stringify({innerWidth,docWidth:document.documentElement.scrollWidth,bodyWidth:document.body.scrollWidth})");
    check(`mobile ${width}px sin overflow horizontal`, metrics.docWidth <= width + 1 && metrics.bodyWidth <= width + 1);
  }

  run(["--session", SESSION, "set", "viewport", "390", "844"]);
  closeMenus();
  for (const [id, pointerType, pointerId] of [["reg-app", "touch", 501], ["reg-folder", "pen", 502]]) {
    const menu = hold(id, pointerType, pointerId);
    check(`hold 560ms ${pointerType} abre opciones de ${id}`, menu.open && menu.itemCount >= 3);
    closeMenus();
    const focus = focusState();
    check(`Escape restaura foco tras hold de ${id}`, focus.id === id);
  }

  setView("list");
  for (const [id, pointerType, pointerId] of [["reg-app", "touch", 503], ["reg-folder", "pen", 504]]) {
    const menu = hold(id, pointerType, pointerId);
    check(`hold 560ms ${pointerType} abre opciones de fila ${id}`, menu.open && menu.itemCount >= 3);
    closeMenus();
  }

  const moved = pageEval(`(()=>{
    const root=document.querySelector('[data-shortcut-id="reg-app"]'); const anchor=root?.querySelector('a'); if(!root||!anchor) return JSON.stringify({error:'missing'});
    const rect=root.getBoundingClientRect(); const init={bubbles:true,pointerId:510,pointerType:'touch',clientX:rect.left+20,clientY:rect.top+20,button:0};
    root.dispatchEvent(new PointerEvent('pointerdown',init));
    root.dispatchEvent(new PointerEvent('pointermove',{...init,clientX:init.clientX+16,clientY:init.clientY+1}));
    root.dispatchEvent(new PointerEvent('pointerup',{...init,clientX:init.clientX+16,clientY:init.clientY+1}));
    const click=new MouseEvent('click',{bubbles:true,cancelable:true}); const dispatched=anchor.dispatchEvent(click);
    return JSON.stringify({dispatched,defaultPrevented:click.defaultPrevented,menu:Boolean(document.querySelector('dialog[open].menu-dialog'))});
  })()`);
  check("movimiento >10px cancela hold y suprime click", moved.defaultPrevented === true && moved.dispatched === false && moved.menu === false);

  const scrolled = pageEval(`(async()=>{
    const root=document.querySelector('[data-shortcut-id="reg-row"]'); const anchor=root?.querySelector('a'); if(!root||!anchor) return JSON.stringify({error:'missing'});
    const rect=root.getBoundingClientRect(); const init={bubbles:true,pointerId:511,pointerType:'touch',clientX:rect.left+20,clientY:rect.top+20,button:0};
    root.dispatchEvent(new PointerEvent('pointerdown',init)); window.dispatchEvent(new Event('scroll',{bubbles:true})); await new Promise(r=>setTimeout(r,30));
    root.dispatchEvent(new PointerEvent('pointerup',init)); const click=new MouseEvent('click',{bubbles:true,cancelable:true}); const dispatched=anchor.dispatchEvent(click);
    return JSON.stringify({dispatched,defaultPrevented:click.defaultPrevented,menu:Boolean(document.querySelector('dialog[open].menu-dialog'))});
  })()`);
  check("scroll cancela hold y suprime click", scrolled.defaultPrevented === true && scrolled.dispatched === false && scrolled.menu === false);

  const keyboardTarget = pageEval("(()=>{const a=document.querySelector('[data-shortcut-id=\\\"reg-app\\\"] a');a?.focus();return Boolean(a&&document.activeElement===a)})()");
  if (keyboardTarget) {
    run(["--session", SESSION, "press", "Shift+F10"]);
    const keyboardMenu = pageEval("JSON.stringify({open:Boolean(document.querySelector('dialog[open].menu-dialog')),label:document.querySelector('dialog[open].menu-dialog')?.getAttribute('aria-label')||''})");
    check("Shift+F10 abre opciones del acceso", keyboardMenu.open === true);
    closeMenus();
    check("Escape restaura foco tras Shift+F10", focusState().id === "reg-app");
  } else record("Shift+F10 abre opciones del acceso", false, "no se pudo enfocar el enlace");

  const tabsBefore = tabData();
  const originalTab = tabsBefore.find((tab) => tab.active) || tabsBefore[0];
  const rect = pageEval("(()=>{const r=document.querySelector('[data-shortcut-id=\\\"reg-app\\\"] a')?.getBoundingClientRect();return r&&JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()");
  if (rect) {
    run(["--session", SESSION, "mouse", "move", String(Math.round(rect.x)), String(Math.round(rect.y))]);
    run(["--session", SESSION, "mouse", "down", "left"]);
    run(["--session", SESSION, "mouse", "up", "left"]);
    await sleep(400);
  }
  const tabsAfter = tabData();
  check("tap corto abre el enlace en una pestaña nueva", Boolean(rect) && tabsAfter.length > tabsBefore.length && tabsAfter.some((tab) => tab.url.includes("example.com")));
  for (const tab of tabsAfter) if (!tabsBefore.some((before) => before.tabId === tab.tabId)) run(["--session", SESSION, "tab", "close", tab.tabId], { allowFailure: true });
  if (originalTab) run(["--session", SESSION, "tab", originalTab.tabId], { allowFailure: true });

  run(["--session", SESSION, "find", "text", "Organizar", "click", "--exact"], { allowFailure: true });
  await sleep(200);
  const orderBefore = pageEval("JSON.stringify(Array.from(document.querySelectorAll('.shortcut-row')).map((root)=>root.getAttribute('data-shortcut-id')))" );
  const source = pageEval("(()=>{const r=document.querySelector('[data-shortcut-id=\\\"reg-app\\\"]')?.getBoundingClientRect();return r&&JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2})})()");
  const target = pageEval("(()=>{const r=document.querySelector('[data-shortcut-id=\\\"reg-folder\\\"]')?.getBoundingClientRect();return r&&JSON.stringify({x:r.left+r.width/2,y:r.top+r.height/2+12})})()");
  if (source && target) {
    run(["--session", SESSION, "mouse", "move", String(Math.round(source.x)), String(Math.round(source.y))]);
    run(["--session", SESSION, "mouse", "down", "left"]);
    await sleep(120);
    run(["--session", SESSION, "mouse", "move", String(Math.round(target.x)), String(Math.round(target.y))]);
    await sleep(120);
    run(["--session", SESSION, "mouse", "up", "left"]);
    await sleep(300);
  }
  const orderAfter = pageEval("JSON.stringify(Array.from(document.querySelectorAll('.shortcut-row')).map((root)=>root.getAttribute('data-shortcut-id')))" );
  check("drag real de mouse reordena filas", Boolean(source && target) && JSON.stringify(orderBefore) !== JSON.stringify(orderAfter));
} catch (error) {
  record("ejecución del flujo de interacciones", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
} finally {
  if (browserStarted && backedUp) {
    try {
      pageEval(restoreCode);
      run(["--session", SESSION, "open", TARGET_URL], { allowFailure: true });
    } catch (error) {
      record("restauración de datos locales", false, error instanceof Error ? error.message.split("\n")[0] : String(error));
    }
  }
  if (browserStarted) run(["--session", SESSION, "close"], { allowFailure: true });
}

const passed = checks.filter((checkResult) => checkResult.pass).length;
const failed = checks.length - passed;
process.stdout.write(`\n${passed}/${checks.length} checks passed${failed ? `; ${failed} failed` : ""}.\n`);
if (failed) process.exitCode = 1;
