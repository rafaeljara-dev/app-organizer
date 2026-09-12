import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, posix, relative, sep } from "node:path";
import * as esbuild from "esbuild";

const OUT = "out";
const BASE = process.env.GITHUB_PAGES === "true" ? "/app-organizer" : "";
const PRECACHE = /\.(html|js|css|json|webmanifest|png|svg|ico|woff2?)$/i;

async function walk(dir) {
  const found = [];
  for (const name of await readdir(dir)) {
    const full = join(dir, name);
    if ((await stat(full)).isDirectory()) found.push(...(await walk(full)));
    else found.push(full);
  }
  return found;
}

const rev = (buf) => createHash("md5").update(buf).digest("hex").slice(0, 12);

const files = (await walk(OUT)).filter((f) => PRECACHE.test(f) && !f.endsWith(`${sep}sw.js`));

const entries = [];
for (const file of files) {
  const buf = await readFile(file);
  const url = `${BASE}/${relative(OUT, file).split(sep).join(posix.sep)}`;
  entries.push({ url, revision: rev(buf) });
  // The shell is served from the directory URL too; precache it under both
  // so a cold, offline launch of the installed app resolves.
  if (url === `${BASE}/index.html`) entries.push({ url: `${BASE}/`, revision: rev(buf) });
}

await esbuild.build({
  entryPoints: ["worker/sw.ts"],
  bundle: true,
  minify: true,
  format: "iife",
  target: "es2020",
  outfile: `${OUT}/sw.js`,
  define: { "self.__SW_MANIFEST": JSON.stringify(entries) },
  logLevel: "warning",
});

const kb = (await stat(`${OUT}/sw.js`)).size / 1024;
console.log(`sw.js  ${kb.toFixed(1)} kB  ·  ${entries.length} archivos precacheados  ·  base "${BASE || "/"}"`);
