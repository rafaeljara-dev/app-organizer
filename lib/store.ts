"use client";

import { useSyncExternalStore } from "react";
import { isFolder, type AppItem, type Doc, type IconProvenance, type Settings } from "./types";
import { defaultDoc } from "./defaults";

const DB_NAME = "estante";
const STORE = "kv";
const KEY = "doc";

let doc: Doc | null = null;
let loaded = false;
const listeners = new Set<() => void>();

function emit() {
  for (const fn of listeners) fn();
}

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      if (!req.result.objectStoreNames.contains(STORE)) req.result.createObjectStore(STORE);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function readDb(): Promise<Doc | null> {
  try {
    const db = await openDb();
    return await new Promise((resolve) => {
      const req = db.transaction(STORE, "readonly").objectStore(STORE).get(KEY);
      req.onsuccess = () => resolve((req.result as Doc) ?? null);
      req.onerror = () => resolve(null);
    });
  } catch {
    return null;
  }
}

let writeTimer: ReturnType<typeof setTimeout> | undefined;
function scheduleWrite(next: Doc) {
  clearTimeout(writeTimer);
  writeTimer = setTimeout(async () => {
    try {
      const db = await openDb();
      db.transaction(STORE, "readwrite").objectStore(STORE).put(next, KEY);
    } catch {
      /* a full or blocked store must not take the session down */
    }
  }, 180);
}

const ICON_SOURCES = new Set<IconProvenance>([
  "manifest", "apple-touch-icon", "link-icon", "favicon.ico",
]);

function isRawSvgDataUrl(value: string) {
  const match = value.match(/^data:image\/svg\+xml(?:;[^,]*)?,(.*)$/is);
  if (!match || /;base64,/i.test(value.slice(0, value.indexOf(",") + 1))) return false;
  try {
    return /<svg\b/i.test(decodeURIComponent(match[1]));
  } catch {
    return /<svg\b/i.test(match[1]);
  }
}

function clearIcon(next: AppItem): AppItem {
  const { icon: _icon, iconUrl: _iconUrl, iconSource: _iconSource,
    provenance: _provenance, iconVersion: _iconVersion, iconTried: _iconTried, ...rest } = next;
  return rest;
}

/** Keep downloaded data URLs, but remove generated/obsolete icon payloads. */
function migrateIcon(raw: AppItem): AppItem {
  const next = { ...raw };
  const provenance = next.provenance ?? next.iconSource;
  const sourceIsKnown = provenance && ICON_SOURCES.has(provenance);
  const isOgImage = (next.iconSource as string | undefined) === "og-image"
    || (next.provenance as string | undefined) === "og-image";
  const isRealDataIcon = typeof next.icon === "string"
    && /^data:image\//i.test(next.icon)
    && !isRawSvgDataUrl(next.icon);

  if (isOgImage || (next.icon && !isRealDataIcon) || (provenance && !sourceIsKnown)) {
    return clearIcon(next);
  }

  if (!next.icon) return clearIcon(next);

  // Legacy records used iconSource; keep it and also expose the explicit
  // provenance field for callers that do not know the old name.
  if (sourceIsKnown) {
    next.iconSource = provenance;
    next.provenance = provenance;
  } else {
    delete next.iconSource;
    delete next.provenance;
  }
  next.iconVersion = 1;
  next.iconTried = true;
  return next;
}

function migrateApp(raw: AppItem): AppItem {
  return migrateIcon(raw);
}

/** Future schema bumps land here, one step per version. */
function migrate(raw: unknown): Doc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<Doc>;
  if (d.schemaVersion !== 1 || !Array.isArray(d.pages) || !d.settings) return null;
  const fallback = defaultDoc().settings;
  const settings = { ...fallback, ...d.settings };
  if (!d.settings.labels) settings.labels = "on";

  const dock = (d.dock ?? []).map(migrateApp);
  const pages = (d.pages ?? []).map((p) => ({
    ...p,
    items: (p.items ?? []).map((it) =>
      isFolder(it)
        ? { ...it, items: it.items.map(migrateApp) }
        : migrateApp(it)
    ),
  }));

  return { ...(d as Doc), settings, dock, pages };
}

export async function boot() {
  if (loaded) return;
  loaded = true;
  const stored = await readDb();
  doc = migrate(stored) ?? defaultDoc();
  if (!stored || JSON.stringify(doc) !== JSON.stringify(stored)) scheduleWrite(doc);
  emit();
  try {
    await navigator.storage?.persist?.();
  } catch {
    /* the browser may simply refuse; the app still works */
  }
}

export function subscribe(fn: () => void) {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}

const getSnapshot = () => doc;
const getServerSnapshot = () => null;

/** Read the current in-memory document for follow-up background work. */
export const getDoc = () => doc;

export function useDoc(): Doc | null {
  return useSyncExternalStore(subscribe, getSnapshot, getServerSnapshot);
}

/** Apply a mutation to a deep copy, then commit it. */
export function update(fn: (draft: Doc) => void) {
  if (!doc) return;
  const draft: Doc = structuredClone(doc);
  fn(draft);
  doc = draft;
  scheduleWrite(draft);
  emit();
}

export function setSetting<K extends keyof Settings>(key: K, value: Settings[K]) {
  update((d) => { d.settings[key] = value; });
}

export function replaceDoc(next: Doc) {
  doc = next;
  scheduleWrite(next);
  emit();
}

export function resetDoc() {
  replaceDoc(defaultDoc());
}

/**
 * The backup leaves the icon images out. They are megabytes of base64 that
 * the app can fetch again in one tap, and a backup you cannot paste into a
 * message is not much of a backup.
 */
export function exportJson(): string {
  if (!doc) return "";
  const strip = <T extends {
    icon?: string; iconUrl?: string; iconSource?: string; provenance?: string;
    iconVersion?: 1; iconTried?: boolean;
  }>(a: T): T => {
    const { icon, iconUrl, iconSource, provenance, iconVersion, iconTried, ...rest } = a;
    return rest as T;
  };
  const lean: Doc = {
    ...doc,
    dock: doc.dock.map(strip),
    pages: doc.pages.map((p) => ({
      ...p,
      items: p.items.map((it) =>
        it.type === "folder" ? { ...it, items: it.items.map(strip) } : strip(it),
      ),
    })),
  };
  return JSON.stringify(lean, null, 2);
}

export function importJson(text: string): boolean {
  try {
    const next = migrate(JSON.parse(text));
    if (!next) return false;
    replaceDoc(next);
    return true;
  } catch {
    return false;
  }
}
