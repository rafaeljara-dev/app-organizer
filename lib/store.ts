"use client";

import { useSyncExternalStore } from "react";
import type { Doc, Settings } from "./types";
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

/** Future schema bumps land here, one step per version. */
function migrate(raw: unknown): Doc | null {
  if (!raw || typeof raw !== "object") return null;
  const d = raw as Partial<Doc>;
  if (d.schemaVersion !== 1 || !Array.isArray(d.pages) || !d.settings) return null;
  const fallback = defaultDoc().settings;
  return { ...(d as Doc), settings: { ...fallback, ...d.settings } };
}

export async function boot() {
  if (loaded) return;
  loaded = true;
  const stored = await readDb();
  doc = migrate(stored) ?? defaultDoc();
  if (!stored) scheduleWrite(doc);
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

export function exportJson(): string {
  return JSON.stringify(doc, null, 2);
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
