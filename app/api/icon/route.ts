import { guardAddress } from "@/lib/net-guard";
import { resolveIcon } from "@/lib/resolve-icon";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const maxDuration = 15;

export async function GET(request: Request) {
  const target = new URL(request.url).searchParams.get("url");
  if (!target) {
    return Response.json({ ok: false, reason: "falta el parámetro url" }, { status: 400 });
  }

  // Check the address once, up front. Inside the resolver a refusal looks
  // like any other failed candidate, so a blocked host would report "no
  // usable icon" when the truth is "I will not touch that host".
  const hasScheme = /^[a-z][a-z0-9+.-]*:/i.test(target);
  if (hasScheme && !/^https?:\/\//i.test(target)) {
    return Response.json({ ok: false, host: target, reason: "esquema no permitido" }, { status: 400 });
  }

  let start: URL;
  try {
    start = new URL(hasScheme ? target : `https://${target}`);
  } catch {
    return Response.json({ ok: false, host: target, reason: "dirección inválida" }, { status: 400 });
  }

  const SAFE_REASONS = new Set([
    "esquema no permitido", "puerto no permitido", "destino interno", "host sin resolver",
  ]);
  try {
    await guardAddress(start);
  } catch (err) {
    // Anything unexpected, a DNS error included, is reported flatly rather
    // than echoed back: the resolver's internals are not the caller's business.
    const raw = err instanceof Error ? err.message : "";
    return Response.json(
      { ok: false, host: start.hostname, reason: SAFE_REASONS.has(raw) ? raw : "destino inalcanzable" },
      { status: 400 },
    );
  }

  let result;
  try {
    result = await resolveIcon(start.toString(), { guard: guardAddress });
  } catch (err) {
    return Response.json(
      { ok: false, host: target, reason: err instanceof Error ? err.message : "fallo al resolver" },
      { status: 400 },
    );
  }

  // Icons change rarely. Let the edge keep them so a shelf full of apps
  // costs one round trip each, once.
  return Response.json(result, {
    status: result.ok ? 200 : 404,
    headers: {
      "cache-control": result.ok
        ? "public, max-age=3600, s-maxage=2592000, stale-while-revalidate=86400"
        : "public, max-age=300, s-maxage=3600",
    },
  });
}
