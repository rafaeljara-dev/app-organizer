/**
 * Work out a site's real icon from nothing but its address.
 *
 * The order matters. A web app manifest is authoritative: the site itself
 * says which image represents it, at which size, plus its name and colour.
 * Only when there is no manifest do we fall back through the older tags,
 * and `/favicon.ico` is the last resort because it is usually 16 pixels of
 * mud. og:image is a social banner, not an icon, so it ranks below all of
 * them but above giving up.
 */

export type IconSource =
  | "manifest"
  | "apple-touch-icon"
  | "link-icon"
  | "og-image"
  | "favicon.ico";

export type IconHit = {
  ok: true;
  host: string;
  name: string;
  themeColor: string | null;
  icon: string;
  iconUrl: string;
  source: IconSource;
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
    ogImage: abs(meta("og:image") || meta("og:image:secure_url")),
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
  if (head.ogImage) out.push({ url: head.ogImage, source: "og-image", score: 25 });
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
  const d = (declared || "").split(";")[0].trim().toLowerCase();
  const b = bytes;
  if (b.length >= 8 && b[0] === 0x89 && b[1] === 0x50 && b[2] === 0x4e && b[3] === 0x47) return "image/png";
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return "image/jpeg";
  if (b.length >= 6 && b[0] === 0x47 && b[1] === 0x49 && b[2] === 0x46) return "image/gif";
  if (b.length >= 12 && b[8] === 0x57 && b[9] === 0x45 && b[10] === 0x42 && b[11] === 0x50) return "image/webp";
  if (b.length >= 4 && b[0] === 0x00 && b[1] === 0x00 && b[2] === 0x01 && b[3] === 0x00) return "image/x-icon";
  const head = new TextDecoder().decode(b.slice(0, 300)).trimStart().toLowerCase();
  if (head.startsWith("<svg") || (head.startsWith("<?xml") && head.includes("<svg"))) return "image/svg+xml";
  // Some CDNs serve a correct type with bytes we do not recognise.
  if (d.startsWith("image/")) return d;
  return null;
}

/* ---------------- fetching ---------------- */

async function readCapped(res: Response, limit: number): Promise<Uint8Array> {
  const buf = new Uint8Array(await res.arrayBuffer());
  return buf.length > limit ? buf.slice(0, limit) : buf;
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

  let start: URL;
  try {
    start = new URL(/^https?:\/\//i.test(target) ? target : `https://${target}`);
  } catch {
    return { ok: false, host: target, reason: "dirección inválida" };
  }
  const host = start.hostname.replace(/^www\./, "");

  const get = async (url: string, limit: number) => {
    const u = new URL(url);
    if (opts.guard) await opts.guard(u);
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), timeoutMs);
    try {
      return await doFetch(url, {
        signal: ctrl.signal,
        redirect: "follow",
        headers: { "user-agent": UA, accept: "*/*" },
      });
    } finally {
      clearTimeout(timer);
    }
  };

  let head: ReturnType<typeof readHead> | null = null;
  let pageUrl = start.toString();
  try {
    const res = await get(pageUrl, htmlLimit);
    if (res.ok) {
      pageUrl = res.url || pageUrl;
      const html = new TextDecoder().decode(await readCapped(res, htmlLimit));
      head = readHead(html, pageUrl);
    }
  } catch {
    /* a site that refuses the page can still have a favicon */
  }

  const candidates: Candidate[] = head ? candidatesFromHead(head) : [];
  let name = head?.siteName || head?.title || "";
  let themeColor = head?.themeColor ?? null;

  if (head?.manifest) {
    try {
      const res = await get(head.manifest, htmlLimit);
      if (res.ok) {
        const json = JSON.parse(new TextDecoder().decode(await readCapped(res, htmlLimit)));
        candidates.push(...candidatesFromManifest(json, res.url || head.manifest));
        name = manifestName(json) || name;
        themeColor = manifestThemeColor(json) ?? themeColor;
      }
    } catch {
      /* a broken manifest is common; the older tags still stand */
    }
  }

  candidates.push({ url: new URL("/favicon.ico", pageUrl).toString(), source: "favicon.ico", score: 20 });

  const seen = new Set<string>();
  const ordered = candidates
    .filter((c) => (seen.has(c.url) ? false : (seen.add(c.url), true)))
    .sort((a, b) => b.score - a.score);

  for (const c of ordered.slice(0, 4)) {
    try {
      const res = await get(c.url, iconLimit);
      if (!res.ok) continue;
      const bytes = await readCapped(res, iconLimit);
      if (bytes.length < 40) continue;
      const type = sniffImage(bytes, res.headers.get("content-type") ?? "");
      if (!type) continue;
      return {
        ok: true,
        host,
        name: (name || host.split(".")[0]).slice(0, 40),
        themeColor,
        icon: `data:${type};base64,${toBase64(bytes)}`,
        iconUrl: c.url,
        source: c.source,
        bytes: bytes.length,
        contentType: type,
      };
    } catch {
      /* try the next candidate */
    }
  }

  return { ok: false, host, reason: "ningún icono utilizable" };
}
