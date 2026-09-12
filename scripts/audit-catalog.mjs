/**
 * Ask a running Estante to resolve the icon of every address it ships with,
 * and print what came back. Point it at your deployment:
 *
 *   node scripts/audit-catalog.mjs https://tu-app.vercel.app
 *
 * Without an argument it uses http://localhost:3000, so `npm run dev` works.
 */
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import * as esbuild from "esbuild";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");

const dir = await mkdtemp(join(tmpdir(), "estante-cat-"));
await writeFile(join(dir, "e.ts"),
  `export { CATALOG } from ${JSON.stringify(process.cwd() + "/lib/catalog.ts")};`);
await esbuild.build({
  entryPoints: [join(dir, "e.ts")], bundle: true, platform: "node", format: "esm",
  outfile: join(dir, "e.mjs"), logLevel: "error",
});
const { CATALOG } = await import(join(dir, "e.mjs"));

console.log(`\nConsultando ${CATALOG.length} direcciones en ${base}\n`);

const rows = [];
const queue = [...CATALOG];
const worker = async () => {
  for (;;) {
    const entry = queue.shift();
    if (!entry) return;
    const started = Date.now();
    try {
      const res = await fetch(`${base}/api/icon?url=${encodeURIComponent(entry.url)}`);
      const body = await res.json();
      rows.push({
        name: entry.name,
        ok: body.ok === true,
        source: body.ok ? body.source : body.reason,
        kb: body.ok ? Math.round(body.icon.length / 1365) : 0,
        ms: Date.now() - started,
      });
    } catch (err) {
      rows.push({ name: entry.name, ok: false, source: String(err).slice(0, 40), kb: 0, ms: Date.now() - started });
    }
  }
};
await Promise.all(Array.from({ length: 5 }, worker));

rows.sort((a, b) => Number(b.ok) - Number(a.ok) || a.name.localeCompare(b.name));
const pad = (s, n) => String(s).padEnd(n).slice(0, n);
console.log(`${pad("APP", 16)} ${pad("", 3)} ${pad("ORIGEN DEL ICONO", 22)} ${pad("KB", 5)} MS`);
for (const r of rows) {
  console.log(`${pad(r.name, 16)} ${pad(r.ok ? "si" : "NO", 3)} ${pad(r.source, 22)} ${pad(r.kb || "", 5)} ${r.ms}`);
}

const good = rows.filter((r) => r.ok).length;
const bySource = {};
for (const r of rows) if (r.ok) bySource[r.source] = (bySource[r.source] ?? 0) + 1;
console.log(`\n${good} de ${rows.length} con icono propio`);
console.log(Object.entries(bySource).map(([k, v]) => `  ${v} desde ${k}`).join("\n") || "");
console.log("");
