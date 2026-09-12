"use client";

import { update } from "./store";
import { isFolder, type AppItem, type Doc } from "./types";

export type Resolved = {
  ok: true; name: string; themeColor: string | null;
  icon: string; source: string; host: string;
} | { ok: false; reason: string };

/** Ask our own endpoint what a site's icon is. */
export async function fetchIcon(url: string, signal?: AbortSignal): Promise<Resolved> {
  try {
    const res = await fetch(`/api/icon?url=${encodeURIComponent(url)}`, { signal });
    const body = await res.json();
    return body?.ok ? body : { ok: false, reason: body?.reason ?? "sin icono" };
  } catch {
    return { ok: false, reason: "sin conexión" };
  }
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

function applyIcon(id: string, patch: Partial<AppItem>) {
  update((d) => {
    for (const list of [d.dock, ...d.pages.map((p) => p.items)]) {
      for (const it of list) {
        if (it.id === id && it.type === "app") { Object.assign(it, patch); return; }
        if (it.type === "folder") {
          const inner = it.items.find((x) => x.id === id);
          if (inner) { Object.assign(inner, patch); return; }
        }
      }
    }
  });
}

export type Progress = { done: number; total: number; ok: number };

/**
 * Fetch the real icon for every app that does not have one yet. Four at a
 * time: enough to feel instant on a full shelf, gentle enough that a phone
 * on mobile data does not stall.
 */
export async function hydrateIcons(
  doc: Doc,
  onProgress?: (p: Progress) => void,
  opts: { force?: boolean } = {},
): Promise<Progress> {
  const pending = everyApp(doc).filter((a) => (opts.force ? true : !a.icon && !a.iconTried));
  const total = pending.length;
  let done = 0, ok = 0;
  onProgress?.({ done, total, ok });
  if (!total) return { done, total, ok };

  const queue = [...pending];
  const worker = async () => {
    for (;;) {
      const item = queue.shift();
      if (!item) return;
      const r = await fetchIcon(item.url);
      if (r.ok) {
        ok++;
        applyIcon(item.id, { icon: r.icon, iconSource: r.source, iconTried: true });
      } else {
        applyIcon(item.id, { iconTried: true });
      }
      done++;
      onProgress?.({ done, total, ok });
    }
  };
  await Promise.all(Array.from({ length: Math.min(4, total) }, worker));
  return { done, total, ok };
}
