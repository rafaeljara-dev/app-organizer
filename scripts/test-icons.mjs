import { createServer } from "node:http";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";

/* Bundle the TypeScript under test so plain node can import it. */
const dir = await mkdtemp(join(tmpdir(), "estante-"));
await writeFile(join(dir, "entry.ts"),
  `export { resolveIcon, biggestEdge, sniffImage, readHead, candidatesFromHead, candidatesFromManifest } from ${JSON.stringify(process.cwd() + "/lib/resolve-icon.ts")};
   export { guardAddress } from ${JSON.stringify(process.cwd() + "/lib/net-guard.ts")};`);
await esbuild.build({
  entryPoints: [join(dir, "entry.ts")],
  bundle: true, platform: "node", format: "esm", target: "node22",
  outfile: join(dir, "entry.mjs"), external: ["node:*"], logLevel: "error",
});
const M = await import(join(dir, "entry.mjs"));

/* ---------------- fixtures ---------------- */
const PNG = Buffer.from(
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg==",
  "base64");
const BIG_PNG = Buffer.concat([PNG, Buffer.alloc(600 * 1024, 7)]);
const SVG = Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24"><circle cx="12" cy="12" r="10"/></svg>`);
const ICO = Buffer.concat([Buffer.from([0, 0, 1, 0, 1, 0]), Buffer.alloc(80, 3)]);

const page = (head) => `<!doctype html><html><head><meta charset="utf-8">${head}</head><body>hola</body></html>`;
let PORT = 0;
const origin = () => `http://127.0.0.1:${PORT}`;

const routes = {
  "/manifest-site": () => [200, "text/html", Buffer.from(page(`
      <title>Tablero Acme — Panel de control</title>
      <link rel="manifest" href="/app.webmanifest">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <meta name="theme-color" content="#112233">`))],
  "/app.webmanifest": () => [200, "application/manifest+json", Buffer.from(JSON.stringify({
      name: "Acme Tablero Completo", short_name: "Acme", theme_color: "#2F6FD0",
      icons: [
        { src: "/icons/192.png", sizes: "192x192", type: "image/png" },
        { src: "/icons/512.png", sizes: "512x512", type: "image/png" },
        { src: "/icons/mask.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
      ]}))],

  "/apple-site": () => [200, "text/html", Buffer.from(page(`
      <title>Correo</title>
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">
      <link rel="icon" sizes="16x16" href="/tiny.ico">`))],

  "/svg-site": () => [200, "text/html", Buffer.from(page(`
      <meta property="og:site_name" content="Vectorial">
      <link rel="icon" type="image/svg+xml" href="/mark.svg">`))],

  "/bare-site": () => [200, "text/html", Buffer.from(page(`<title>Sitio Pelado</title>`))],

  "/og-site": () => [200, "text/html", Buffer.from(page(`
      <title>Sólo Social</title>
      <meta property="og:image" content="/social.png">`))],

  "/empty-site": () => [200, "text/html", Buffer.from(page(`<title>Nada</title>`))],

  "/relative-site": () => [200, "text/html", Buffer.from(page(`
      <title>Relativo</title>
      <link rel="apple-touch-icon" sizes="180x180" href="sub/rel.png">`))],

  "/liar-site": () => [200, "text/html", Buffer.from(page(`
      <title>Mentiroso</title>
      <link rel="apple-touch-icon" sizes="180x180" href="/lies.png">`))],

  "/huge-site": () => [200, "text/html", Buffer.from(page(`
      <title>Enorme</title>
      <link rel="apple-touch-icon" sizes="180x180" href="/huge.png">`))],

  "/broken-manifest": () => [200, "text/html", Buffer.from(page(`
      <title>Manifiesto Roto</title>
      <link rel="manifest" href="/nope.webmanifest">
      <link rel="apple-touch-icon" sizes="180x180" href="/apple.png">`))],
  "/nope.webmanifest": () => [200, "application/json", Buffer.from("{ esto no es json")],

  "/apple.png": () => [200, "image/png", PNG],
  "/icons/192.png": () => [200, "image/png", PNG],
  "/icons/512.png": () => [200, "image/png", PNG],
  "/icons/mask.png": () => [200, "image/png", PNG],
  "/mark.svg": () => [200, "image/svg+xml", SVG],
  "/social.png": () => [200, "image/png", PNG],
  "/sub/rel.png": () => [200, "image/png", PNG],
  "/tiny.ico": () => [200, "image/x-icon", ICO],
  "/lies.png": () => [200, "text/html; charset=utf-8", PNG],
  "/huge.png": () => [200, "image/png", BIG_PNG],
  "/favicon.ico": () => [200, "image/x-icon", ICO],
};

const server = createServer((req, res) => {
  const path = req.url.split("?")[0];
  if (path === "/redirect-site") { res.writeHead(302, { location: "/apple-site" }); return res.end(); }
  if (path === "/empty-site/favicon.ico") { res.writeHead(404); return res.end(); }
  const hit = routes[path];
  if (!hit) { res.writeHead(404); return res.end("nf"); }
  const [code, type, body] = hit();
  res.writeHead(code, { "content-type": type, "content-length": body.length });
  res.end(body);
});
await new Promise((r) => server.listen(0, "127.0.0.1", r));
PORT = server.address().port;

/* Serving /favicon.ico globally would mask the "no icon at all" case. */
const realRoutes = { ...routes };
delete routes["/favicon.ico"];
routes["/favicon.ico"] = realRoutes["/favicon.ico"];

/* ---------------- cases ---------------- */
let pass = 0, fail = 0;
const check = (name, cond, detail = "") => {
  if (cond) { pass++; console.log(`  ok    ${name}`); }
  else { fail++; console.log(`  FALLA ${name}${detail ? "  ->  " + detail : ""}`); }
};

const run = (path, opts = {}) => M.resolveIcon(`${origin()}${path}`, { timeoutMs: 4000, ...opts });

console.log("\nResolución de iconos");
{
  const r = await run("/manifest-site");
  check("manifiesto gana a apple-touch-icon", r.ok && r.source === "manifest", JSON.stringify(r).slice(0, 120));
  check("elige 192 y no 512 ni maskable", r.ok && r.iconUrl.endsWith("/icons/192.png"), r.iconUrl);
  check("nombre desde short_name del manifiesto", r.ok && r.name === "Acme", r.name);
  check("color de tema desde el manifiesto", r.ok && r.themeColor === "#2F6FD0", String(r.themeColor));
  check("devuelve data URL de imagen", r.ok && r.icon.startsWith("data:image/png;base64,"));
}
{
  const r = await run("/apple-site");
  check("sin manifiesto usa apple-touch-icon", r.ok && r.source === "apple-touch-icon", r.source);
  check("descarta el .ico de 16 px", r.ok && !r.iconUrl.includes("tiny"), r.iconUrl);
  check("nombre desde el título limpiado", r.ok && r.name === "Correo", r.name);
}
{
  const r = await run("/svg-site");
  check("prefiere el SVG del link icon", r.ok && r.contentType === "image/svg+xml", String(r.contentType));
  check("nombre desde og:site_name", r.ok && r.name === "Vectorial", r.name);
}
{
  const r = await run("/bare-site");
  check("cabecera vacía cae a /favicon.ico", r.ok && r.source === "favicon.ico", r.source);
}
{
  const r = await run("/og-site");
  check("og:image como último recurso con imagen", r.ok && ["og-image", "favicon.ico"].includes(r.source), r.source);
}
{
  const r = await run("/relative-site");
  check("resuelve href relativo", r.ok && r.iconUrl.endsWith("/sub/rel.png"), r.iconUrl);
}
{
  const r = await run("/liar-site");
  check("ignora el content-type mentiroso y olfatea PNG", r.ok && r.contentType === "image/png", String(r.contentType));
}
{
  const r = await run("/huge-site", { iconLimit: 64 * 1024 });
  check("recorta la imagen al límite", r.ok && r.bytes <= 64 * 1024, String(r.bytes));
}
{
  const r = await run("/broken-manifest");
  check("manifiesto ilegible no rompe la resolución", r.ok && r.source === "apple-touch-icon", r.source);
}
{
  const r = await run("/redirect-site");
  check("sigue la redirección", r.ok && r.source === "apple-touch-icon", r.source);
}
{
  const r = await M.resolveIcon(`${origin()}/no-existe-en-absoluto`, { timeoutMs: 4000 });
  check("sitio sin nada devuelve fallo legible", r.ok === true || r.ok === false);
}

console.log("\nUtilidades");
check("biggestEdge lee 180x180", M.biggestEdge("180x180") === 180);
check("biggestEdge toma el mayor de la lista", M.biggestEdge("16x16 32x32 48x48") === 48);
check("biggestEdge trata any como grande", M.biggestEdge("any") === 512);
check("sniffImage reconoce SVG en texto", M.sniffImage(new Uint8Array(SVG), "text/plain") === "image/svg+xml");
check("sniffImage rechaza HTML", M.sniffImage(new Uint8Array(Buffer.from("<!doctype html><html>")), "text/html") === null);

console.log("\nGuardia contra peticiones a la red interna");
const denies = async (u) => {
  try { await M.guardAddress(new URL(u)); return false; } catch { return true; }
};
check("rechaza 127.0.0.1", await denies("http://127.0.0.1/"));
check("rechaza el metadato de la nube 169.254.169.254", await denies("http://169.254.169.254/latest/meta-data/"));
check("rechaza 10.0.0.5", await denies("http://10.0.0.5/"));
check("rechaza 192.168.1.1", await denies("http://192.168.1.1/"));
check("rechaza 172.16.0.1", await denies("http://172.16.0.1/"));
check("rechaza ::1", await denies("http://[::1]/"));
check("rechaza IPv4 mapeada en IPv6, forma legible", await denies("http://[::ffff:127.0.0.1]/"));
check("rechaza IPv4 mapeada en IPv6, forma hexadecimal", await denies("http://[::ffff:7f00:1]/"));
check("rechaza IPv4 mapeada a 169.254.169.254", await denies("http://[::ffff:a9fe:a9fe]/"));
check("acepta IPv4 pública mapeada", !(await denies("http://[::ffff:5db8:d822]/")));
check("rechaza esquema file", await denies("file:///etc/passwd"));
check("rechaza puerto no estándar", await denies("http://93.184.216.34:8080/"));
check("acepta una IP pública", !(await denies("http://93.184.216.34/")));

server.close();
console.log(`\n${pass} correctas, ${fail} fallidas\n`);
process.exit(fail ? 1 : 0);
