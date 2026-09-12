import { lookup } from "node:dns/promises";
import { isIP } from "node:net";

/**
 * This endpoint fetches whatever address it is handed, so it is an open
 * proxy unless it refuses to touch the inside of the network. Everything
 * below is that refusal: only http and https, only the standard ports, and
 * only after the hostname resolves to a public address.
 */
function isPrivateAddress(ip: string): boolean {
  if (ip.includes(":")) {
    const v6 = ip.toLowerCase();
    if (v6 === "::" || v6 === "::1") return true;
    if (/^f[cd][0-9a-f]{2}:/.test(v6)) return true;        // unique local
    if (/^fe[89ab][0-9a-f]:/.test(v6)) return true;        // link local
    // An IPv4 address can hide inside IPv6 two ways, and the URL parser
    // rewrites the readable one into hex: ::ffff:127.0.0.1 -> ::ffff:7f00:1
    const dotted = v6.match(/^::ffff:(\d+\.\d+\.\d+\.\d+)$/);
    if (dotted) return isPrivateAddress(dotted[1]);
    const hex = v6.match(/^::ffff:([0-9a-f]{1,4}):([0-9a-f]{1,4})$/);
    if (hex) {
      const n = (parseInt(hex[1], 16) << 16) | parseInt(hex[2], 16);
      return isPrivateAddress([(n >>> 24) & 255, (n >>> 16) & 255, (n >>> 8) & 255, n & 255].join("."));
    }
    return false;
  }
  const p = ip.split(".").map(Number);
  if (p.length !== 4 || p.some((n) => Number.isNaN(n) || n < 0 || n > 255)) return true;
  const [a, b] = p;
  if (a === 0 || a === 10 || a === 127) return true;
  if (a === 169 && b === 254) return true;                 // link local, cloud metadata
  if (a === 172 && b >= 16 && b <= 31) return true;
  if (a === 192 && b === 168) return true;
  if (a === 192 && b === 0) return true;
  if (a === 100 && b >= 64 && b <= 127) return true;       // carrier grade NAT
  if (a === 198 && (b === 18 || b === 19)) return true;    // benchmarking
  if (a >= 224) return true;                               // multicast and reserved
  return false;
}

export async function guardAddress(u: URL): Promise<void> {
  if (u.protocol !== "http:" && u.protocol !== "https:") throw new Error("esquema no permitido");
  const port = u.port ? Number(u.port) : u.protocol === "https:" ? 443 : 80;
  if (port !== 80 && port !== 443) throw new Error("puerto no permitido");

  const host = u.hostname.replace(/^\[|\]$/g, "");
  const addresses = isIP(host)
    ? [{ address: host }]
    : await lookup(host, { all: true, verbatim: true });
  if (addresses.length === 0) throw new Error("host sin resolver");
  for (const a of addresses) {
    if (isPrivateAddress(a.address)) throw new Error("destino interno");
  }
}

