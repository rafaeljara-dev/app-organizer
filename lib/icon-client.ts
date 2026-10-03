"use client";

import { update } from "./store";
import { isFolder, type AppItem, type Doc, type IconProvenance } from "./types";

export type Resolved = {
  ok: true;
  name: string;
  themeColor: string | null;
  icon: string;
  iconUrl: string;
  source: IconProvenance;
  provenance?: IconProvenance;
  iconVersion: 1;
  host: string;
} | { ok: false; reason: string };

/** Shared requests keep a shelf full of duplicate hosts to one network call. */
const inFlight = new Map<string, Promise<Resolved>>();

function waitForRequest(shared: Promise<Resolved>, signal?: AbortSignal): Promise<Resolved> {
  if (!signal) return shared;
  if (signal.aborted) return Promise.resolve({ ok: false, reason: "cancelado" });
  return new Promise((resolve) => {
    let settled = false;
    const finish = (value: Resolved) => {
      if (settled) return;
      settled = true;
      signal.removeEventListener("abort", onAbort);
      resolve(value);
    };
    const onAbort = () => finish({ ok: false, reason: "cancelado" });
    signal.addEventListener("abort", onAbort, { once: true });
    shared.then(finish, () => finish({ ok: false, reason: "sin conexión" }));
  });
}

/** Ask our own endpoint what a site's icon is. */
export async function fetchIcon(url: string, signal?: AbortSignal): Promise<Resolved> {
  const key = url.trim();
  if (!key) return { ok: false, reason: "dirección inválida" };

  let shared = inFlight.get(key);
  if (!shared) {
    shared = (async () => {
      try {
        // Abort is handled per caller by waitForRequest. The shared request
        // must continue so one unmount cannot cancel all duplicate consumers.
        const res = await fetch(`/api/icon?v=1&url=${encodeURIComponent(key)}`);
        let body: unknown;
        try { body = await res.json(); } catch { body = null; }
        const value = body as Partial<Extract<Resolved, { ok: true }>> & { reason?: string } | null;
        if (res.ok && value?.ok && value.icon && value.iconUrl && value.source) {
          return {
            ok: true,
            name: value.name ?? "",
            themeColor: value.themeColor ?? null,
            icon: value.icon,
            iconUrl: value.iconUrl,
            source: value.source,
            provenance: value.provenance ?? value.source,
            iconVersion: 1,
            host: value.host ?? "",
          } satisfies Extract<Resolved, { ok: true }>;
        }
        return { ok: false, reason: value?.reason ?? "sin icono" };
      } catch {
        return { ok: false, reason: "sin conexión" };
      }
    })();
    inFlight.set(key, shared);
    void shared.finally(() => {
      if (inFlight.get(key) === shared) inFlight.delete(key);
    });
  }
  return waitForRequest(shared, signal);
}

function everyApp(doc: Doc): AppItem[] {
  const out: AppItem[] = [...doc.dock];
  for (const p of doc.pages) {
    for (const it of p.items) {
      if (isFolder(it)) out.push(...it.items);
      else out.push(it);
    }
  }
  return out;
}

/** Apply only while the item still points at the URL that was fetched. */
function applyIcon(id: string, expectedUrl: string, patch: Partial<AppItem>) {
  let applied = false;
  update((d) => {
    for (const list of [d.dock, ...d.pages.map((p) => p.items)]) {
      for (const it of list) {
        if (it.id === id && it.type === "app") {
          if (it.url !== expectedUrl) return;
          Object.assign(it, patch);
          applied = true;
          return;
        }
        if (it.type === "folder") {
          const inner = it.items.find((x) => x.id === id);
          if (inner) {
            if (inner.url !== expectedUrl) return;
            Object.assign(inner, patch);
            applied = true;
            return;
          }
        }
      }
    }
  });
  return applied;
}

export type Progress = { done: number; total: number; ok: number };

/**
 * Fetch the real icon for every app that has not been resolved by the current
 * resolver. Four workers keep first load responsive on a phone. An old
 * missing version or a migrated failed attempt is deliberately retried once.
 */
export async function hydrateIcons(
  doc: Doc,
  onProgress?: (p: Progress) => void,
  opts: { force?: boolean } = {},
): Promise<Progress> {
  const pending = everyApp(doc).filter((a) => opts.force || a.iconVersion !== 1);
  const total = pending.length;
  let done = 0;
  let ok = 0;
  onProgress?.({ done, total, ok });
  if (!total) return { done, total, ok };

  const queue = [...pending];
  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const expectedUrl = item.url;
      const r = await fetchIcon(expectedUrl);
      if (r.ok) {
        ok++;
        applyIcon(item.id, expectedUrl, {
          icon: r.icon,
          iconUrl: r.iconUrl,
          iconSource: r.source,
          provenance: r.provenance ?? r.source,
          iconVersion: 1,
          iconTried: true,
        });
      } else {
        // Mark the attempt only if the URL still matches. A concurrent edit
        // must be allowed to hydrate the new URL on its own.
        applyIcon(item.id, expectedUrl, { iconVersion: 1, iconTried: true });
      }
      done++;
      onProgress?.({ done, total, ok });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
  return { done, total, ok };
}

/** Resolve one newly created app while preserving the same race guard. */
export async function hydrateApp(item: AppItem): Promise<boolean> {
  const expectedUrl = item.url;
  const result = await fetchIcon(expectedUrl);
  if (result.ok) {
    return applyIcon(item.id, expectedUrl, {
      icon: result.icon,
      iconUrl: result.iconUrl,
      iconSource: result.source,
      provenance: result.provenance ?? result.source,
      iconVersion: 1,
      iconTried: true,
    });
  }
  return applyIcon(item.id, expectedUrl, { iconVersion: 1, iconTried: true });
}
