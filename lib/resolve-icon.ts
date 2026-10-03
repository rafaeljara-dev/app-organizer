/**
 * Resolve the icon a site publishes for itself.
 *
 * The order is deliberately limited to browser icon sources: the web app
 * manifest, apple-touch-icon, link rel=icon and finally /favicon.ico.
 * Social images are banners and are never used as launcher icons.
 */

import type { IconProvenance } from "./types";

export type IconSource = IconProvenance;

export type IconHit = {
  ok: true;
  host: string;
  name: string;
  themeColor: string | null;
  icon: string;
  iconUrl: string;
  source: IconSource;
  provenance: IconSource;
  iconVersion: 1;
  bytes: number;
  contentType: string;
};

export type IconMiss = { ok: false; host: string; reason: string };
export type IconResult = IconHit | IconMiss;

type Fetcher = (url: string, init?: RequestInit) => Promise<Response>;

export type ResolveOptions = {
  fetchImpl?: Fetcher;
  /** Throws to refuse an address, e.g. one that resolves to a private host. */
  guard?: (u: URL) => Promise<void> | void;
  htmlLimit?: number;
  iconLimit?: number;
  timeoutMs?: number;
};

const HTML_LIMIT = 512 * 1024;
const ICON_LIMIT = 400 * 1024;
const TIMEOUT = 7000;
const RESOLUTION_DEADLINE = 12000;
const MAX_REDIRECTS = 5;
const UA = "Mozilla/5.0 (compatible; EstanteIconBot/1.0; +https://github.com/rafaeljara-dev/app-organizer)";

/* ---------------- parsing ---------------- */

const attr = (tag: string, name: string) => {
  const m = tag.match(new RegExp(`${name}\\s*=\\s*("([^"]*)"|'([^']*)'|([^\\s"'>]+))`, "i"));
  return m ? (m[2] ?? m[3] ?? m[4] ?? "").trim() : "";
};

/** "180x180" or "16x16 32x32" or "any" -> the largest edge, 0 when unknown. */
export function biggestEdge(sizes: string): number {
  if (!sizes) return 0;
  if (/^any$/i.test(sizes.trim())) return 512;
  let best = 0;
  for (const part of sizes.split(/\s+/)) {
    const m = part.match(/^(\d+)\s*[x×]\s*(\d+)$/i);
    if (m) best = Math.max(best, Number(m[1]), Number(m[2]));
  }
  return best;
}

/** How good is an image of this edge length as a launcher icon? */
function sizeScore(edge: number): number {
  if (!edge) return 0;
  const ratio = Math.log2(edge / 256);
  return Math.max(-14, 18 - Math.abs(ratio) * 7);
}

function typeScore(url: string, type: string): number {
  const t = (type || url).toLowerCase();
  if (t.includes("svg")) return 10;
  if (t.includes("png") || t.includes("webp")) return 8;
  if (t.includes("jpeg") || t.includes("jpg")) return 2;
  if (t.includes("ico")) return -6;
  return 0;
}

type Candidate = { url: string; score: number; source: IconSource };

function tags(html: string, name: string): string[] {
  return html.match(new RegExp(`<${name}\\b[^>]*>`, "gi")) ?? [];
}

export function readHead(html: string, base: string) {
  const head = html.slice(0, HTML_LIMIT);
  const abs = (href: string) => {
    if (!href) return "";
    try { return new URL(href, base).toString(); } catch { return ""; }
  };

  const links = tags(head, "link").map((t) => ({
    rel: attr(t, "rel").toLowerCase(),
    href: abs(attr(t, "href")),
    sizes: attr(t, "sizes"),
    type: attr(t, "type"),
  })).filter((l) => l.href);

  const metas = tags(head, "meta").map((t) => ({
    key: (attr(t, "property") || attr(t, "name")).toLowerCase(),
    content: attr(t, "content"),
  }));
  const meta = (k: string) => metas.find((m) => m.key === k)?.content ?? "";

  const titleMatch = head.match(/<title[^>]*>([\s\S]{0,300}?)<\/title>/i);
  const title = titleMatch
    ? titleMatch[1].replace(/\s+/g, " ").trim().split(/\s+[|–—-]\s+/)[0]
    : "";

  return {
    links,
    manifest: links.find((l) => l.rel.split(/\s+/).includes("manifest"))?.href ?? "",
    themeColor: meta("theme-color") || null,
    siteName: meta("og:site_name") || meta("application-name") || meta("apple-mobile-web-app-title"),
    title,
  };
}

export function candidatesFromHead(head: ReturnType<typeof readHead>): Candidate[] {
  const out: Candidate[] = [];
  for (const l of head.links) {
    const rels = l.rel.split(/\s+/);
    const edge = biggestEdge(l.sizes);
    if (rels.includes("apple-touch-icon") || rels.includes("apple-touch-icon-precomposed")) {
      out.push({ url: l.href, source: "apple-touch-icon", score: 80 + sizeScore(edge || 180) + typeScore(l.href, l.type) });
    } else if (rels.includes("icon") || rels.includes("shortcut")) {
      out.push({ url: l.href, source: "link-icon", score: 62 + sizeScore(edge) + typeScore(l.href, l.type) });
    }
  }
  return out;
}

type ManifestIcon = { src?: string; sizes?: string; type?: string; purpose?: string };

export function candidatesFromManifest(json: unknown, base: string): Candidate[] {
  const m = json as { icons?: ManifestIcon[] };
  if (!m || !Array.isArray(m.icons)) return [];
  const out: Candidate[] = [];
  for (const i of m.icons) {
    if (!i?.src) continue;
    let url: string;
    try { url = new URL(i.src, base).toString(); } catch { continue; }
    const edge = biggestEdge(i.sizes ?? "");
    // A maskable icon is drawn with a safe zone, so it looks cropped when
    // shown unmasked. Usable, but only if nothing plain is on offer.
    const maskablePenalty = /maskable/i.test(i.purpose ?? "") ? -12 : 0;
    out.push({
      url,
      source: "manifest",
      score: 100 + sizeScore(edge) + typeScore(url, i.type ?? "") + maskablePenalty,
    });
  }
  return out;
}

export function manifestName(json: unknown): string {
  const m = json as { short_name?: string; name?: string };
  return (m?.short_name || m?.name || "").trim();
}

export function manifestThemeColor(json: unknown): string | null {
  const m = json as { theme_color?: string };
  return m?.theme_color?.trim() || null;
}

/* ---------------- image sniffing ---------------- */

export function sniffImage(bytes: Uint8Array, declared: string): string | null {
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  const head = new TextDecoder().decode(b.slice(0, 512)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  // Do not trust an image content type when the bytes are not an image. This
  // keeps an HTML error page from being persisted as an icon.
  void declared;
  return null;
}

/* ---------------- fetching ---------------- */

type Loaded = { response: Response; url: string; bytes: Uint8Array };

function redirectStatus(status: number) {
  return status === 301 || status === 302 || status === 303 || status === 307 || status === 308;
}

async function readCapped(res: Response, limit: number, signal: AbortSignal): Promise<Uint8Array> {
  const contentLength = Number(res.headers.get("content-length") ?? "");
  if (Number.isFinite(contentLength) && contentLength > limit) {
    throw new Error("respuesta demasiado grande");
  }

  if (!res.body) {
    if (signal.aborted) throw new Error("tiempo agotado");
    const bytes = new Uint8Array(await new Promise<ArrayBuffer>((resolve, reject) => {
      const abort = () => reject(new Error("tiempo agotado"));
      signal.addEventListener("abort", abort, { once: true });
      res.arrayBuffer().then(
        (value) => {
          signal.removeEventListener("abort", abort);
          resolve(value);
        },
        (error) => {
          signal.removeEventListener("abort", abort);
          reject(error);
        },
      );
    }));
    if (bytes.length > limit) throw new Error("respuesta demasiado grande");
    return bytes;
  }

  const reader = res.body.getReader();
  const chunks: Uint8Array[] = [];
  let total = 0;
  try {
    for (;;) {
      if (signal.aborted) throw new Error("tiempo agotado");
      const part = await new Promise<ReadableStreamReadResult<Uint8Array>>((resolve, reject) => {
        const abort = () => reject(new Error("tiempo agotado"));
        signal.addEventListener("abort", abort, { once: true });
        reader.read().then(
          (value) => {
            signal.removeEventListener("abort", abort);
            resolve(value);
          },
          (error) => {
            signal.removeEventListener("abort", abort);
            reject(error);
          },
        );
      });
      if (part.done) break;
      const chunk = part.value;
      total += chunk.byteLength;
      if (total > limit) {
        try { await reader.cancel(); } catch { /* best effort */ }
        throw new Error("respuesta demasiado grande");
      }
      chunks.push(new Uint8Array(chunk));
    }
  } finally {
    reader.releaseLock();
  }

  const bytes = new Uint8Array(total);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return bytes;
}

async function guardWithDeadline(
  guard: ResolveOptions["guard"],
  url: URL,
  deadline: number,
) {
  if (!guard) return;
  const remaining = deadline - Date.now();
  if (remaining <= 0) throw new Error("tiempo agotado");
  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    await Promise.race([
      Promise.resolve(guard(url)),
      new Promise<never>((_, reject) => {
        timer = setTimeout(() => reject(new Error("tiempo agotado")), remaining);
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

/** Fetch one response, checking every redirect and consuming its whole body. */
async function fetchBody(
  target: string,
  limit: number,
  timeoutMs: number,
  doFetch: Fetcher,
  guard: ResolveOptions["guard"],
  globalDeadline?: number,
): Promise<Loaded> {
  const deadline = Math.min(Date.now() + timeoutMs, globalDeadline ?? Number.POSITIVE_INFINITY);
  const seen = new Set<string>();
  let current = new URL(target).toString();

  for (let hop = 0; hop <= MAX_REDIRECTS; hop++) {
    if (seen.has(current)) throw new Error("redirección circular");
    seen.add(current);
    const currentUrl = new URL(current);
    if (currentUrl.protocol !== "http:" && currentUrl.protocol !== "https:") {
      throw new Error("esquema no permitido");
    }
    await guardWithDeadline(guard, currentUrl, deadline);

    const remaining = deadline - Date.now();
    if (remaining <= 0) throw new Error("tiempo agotado");
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), remaining);
    try {
      const response = await doFetch(current, {
        signal: controller.signal,
        redirect: "manual",
        headers: { "user-agent": UA, accept: "*/*" },
      });

      if (redirectStatus(response.status)) {
        const location = response.headers.get("location");
        if (!location) throw new Error("redirección sin destino");
        current = new URL(location, current).toString();
        continue;
      }

      const finalUrl = new URL(response.url || current).toString();
      // A custom fetcher may have followed redirects despite redirect:manual.
      // Check the final URL too, so that path cannot bypass the SSRF guard.
      await guardWithDeadline(guard, new URL(finalUrl), deadline);
      const bytes = response.ok ? await readCapped(response, limit, controller.signal) : new Uint8Array();
      return { response, url: finalUrl, bytes };
    } finally {
      clearTimeout(timer);
    }
  }

  throw new Error("demasiadas redirecciones");
}

function toBase64(bytes: Uint8Array): string {
  if (typeof Buffer !== "undefined") return Buffer.from(bytes).toString("base64");
  let s = "";
  for (const b of bytes) s += String.fromCharCode(b);
  return btoa(s);
}

export async function resolveIcon(target: string, opts: ResolveOptions = {}): Promise<IconResult> {
  const doFetch = opts.fetchImpl ?? fetch;
  const htmlLimit = opts.htmlLimit ?? HTML_LIMIT;
  const iconLimit = opts.iconLimit ?? ICON_LIMIT;
  const timeoutMs = opts.timeoutMs ?? TIMEOUT;
  // The route has a 15s execution budget. Leave a buffer for serialization and
  // make all page, manifest, redirect and icon requests share this deadline.
  const resolutionDeadline = Date.now() + RESOLUTION_DEADLINE;

  let start: URL;
  if (/^[a-z][a-z0-9+.-]*:/i.test(target) && !/^https?:\/\//i.test(target)) {
    return { ok: false, host: target, reason: "esquema no permitido" };
  }
  try {
    start = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
  } catch {
    return { ok: false, host: target, reason: "dirección inválida" };
  }
  const host = start.hostname.replace(/^www\./, "");

  let head: ReturnType<typeof readHead> | null = null;
  let pageUrl = start.toString();
  try {
    const page = await fetchBody(pageUrl, htmlLimit, timeoutMs, doFetch, opts.guard, resolutionDeadline);
    if (page.response.ok) {
      pageUrl = page.url;
      head = readHead(new TextDecoder().decode(page.bytes), pageUrl);
    }
  } catch {
    /* A site that refuses the page can still have a root favicon. */
  }

  const candidates: Candidate[] = head ? candidatesFromHead(head) : [];
  let name = head?.siteName || head?.title || "";
  let themeColor = head?.themeColor ?? null;

  if (head?.manifest) {
    try {
      const manifest = await fetchBody(head.manifest, htmlLimit, timeoutMs, doFetch, opts.guard, resolutionDeadline);
      if (manifest.response.ok) {
        const json = JSON.parse(new TextDecoder().decode(manifest.bytes));
        candidates.push(...candidatesFromManifest(json, manifest.url));
        name = manifestName(json) || name;
        themeColor = manifestThemeColor(json) ?? themeColor;
      }
    } catch {
      /* A broken manifest is common; older tags still stand. */
    }
  }

  let faviconUrl: string;
  try {
    faviconUrl = new URL("/favicon.ico", pageUrl).toString();
  } catch {
    faviconUrl = new URL("/favicon.ico", start).toString();
  }

  const seen = new Set<string>();
  const ordered = candidates
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .sort((a, b) => b.score - a.score);
  // Four broken declarations must never prevent the conventional favicon
  // from being tried. It is deliberately outside the four candidate budget.
  const attempts = ordered.slice(0, 4);
  if (!attempts.some((candidate) => candidate.url === faviconUrl)) {
    attempts.push({ url: faviconUrl, source: "favicon.ico", score: 20 });
  }

  for (const c of attempts) {
    try {
      const loaded = await fetchBody(c.url, iconLimit, timeoutMs, doFetch, opts.guard, resolutionDeadline);
      if (!loaded.response.ok || loaded.bytes.length === 0) continue;
      const type = sniffImage(loaded.bytes, loaded.response.headers.get("content-type") ?? "");
      if (!type) continue;
      return {
        ok: true,
        host,
        name: (name || host.split(".")[0]).slice(0, 40),
        themeColor,
        icon: `data:${type};base64,${toBase64(loaded.bytes)}`,
        iconUrl: loaded.url,
        source: c.source,
        provenance: c.source,
        iconVersion: 1,
        bytes: loaded.bytes.length,
        contentType: type,
      };
    } catch {
      /* A bad candidate must not stop the remaining candidates. */
    }
  }

  return { ok: false, host, reason: "ningún icono utilizable" };
}
