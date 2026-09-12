"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Icon } from "@/lib/glyphs";
import { boot, update, useDoc } from "@/lib/store";
import { isFolder, type AppItem, type Doc, type Folder, type Item } from "@/lib/types";
import Dock from "./Dock";
import GlassDefs from "./GlassDefs";
import { AddSheet, EditSheet, SettingsSheet } from "./Sheets";
import { Ico, Row, hostOf } from "./Tile";

type Sheet = "none" | "settings" | "add" | "edit";
type Menu = { item: Item; x: number; y: number } | null;

/** Every app in the document, with the page it sits on. */
function flatten(doc: Doc) {
  const out: { item: AppItem; where: string }[] = [];
  for (const d of doc.dock) out.push({ item: d, where: "Dock" });
  for (const p of doc.pages) {
    for (const it of p.items) {
      if (isFolder(it)) for (const k of it.items) out.push({ item: k, where: `${p.name} · ${it.name}` });
      else out.push({ item: it, where: p.name });
    }
  }
  return out;
}

export default function Home() {
  const doc = useDoc();
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(false);
  const [searching, setSearching] = useState(false);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [target, setTarget] = useState<Item | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [folder, setFolder] = useState<Folder | null>(null);
  const [toast, setToast] = useState("");
  const trackRef = useRef<HTMLDivElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout>>(undefined);

  useEffect(() => { void boot(); }, []);

  const say = useCallback((m: string) => {
    setToast(m);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  // Settings drive the document element so plain CSS can read them.
  useEffect(() => {
    if (!doc) return;
    const s = doc.settings;
    const r = document.documentElement;
    r.style.setProperty("--cols", String(s.cols));
    r.style.setProperty("--scale", String(s.scale));
    r.style.setProperty("--row-gap", s.labels === "on" ? "18px" : "24px");
    r.dataset.wp = s.wp;
    r.dataset.shape = s.shape;
    r.dataset.labels = s.labels;
    r.dataset.refract = s.refract;
    if (s.theme === "system") delete r.dataset.theme;
    else r.dataset.theme = s.theme;
  }, [doc]);

  useEffect(() => {
    document.documentElement.dataset.edit = edit ? "1" : "0";
  }, [edit]);

  const launch = useCallback((item: AppItem) => {
    say(`Abriendo ${item.name}`);
    const w = window.open(item.url, "_blank", "noopener");
    if (!w) say(`Abre ${hostOf(item.url)} en tu navegador`);
  }, [say]);

  const remove = useCallback((id: string) => {
    update((d) => {
      for (const p of d.pages) {
        const i = p.items.findIndex((x) => x.id === id);
        if (i >= 0) { p.items.splice(i, 1); return; }
        for (const f of p.items) {
          if (!isFolder(f)) continue;
          const j = f.items.findIndex((x) => x.id === id);
          if (j >= 0) { f.items.splice(j, 1); return; }
        }
      }
      const k = d.dock.findIndex((x) => x.id === id);
      if (k >= 0) d.dock.splice(k, 1);
    });
    say("Quitada del estante");
  }, [say]);

  const results = useMemo(() => {
    if (!doc) return [];
    const all = flatten(doc);
    const q = query.trim().toLowerCase();
    const hits = q
      ? all.filter((x) => (x.item.name + " " + x.item.url).toLowerCase().includes(q))
      : all.slice(0, 6);
    return hits.slice(0, 8).map((x) => x.item);
  }, [doc, query]);

  // Drag to reorder, DOM-first: move the node, then rebuild the array from it.
  const bindDrag = useCallback((cell: HTMLDivElement | null, listId: string) => {
    if (!cell || cell.dataset.bound === listId) return;
    cell.dataset.bound = listId;
    cell.addEventListener("pointerdown", (e) => {
      if (document.documentElement.dataset.edit !== "1") return;
      if ((e.target as HTMLElement).closest(".kill")) return;
      if (e.pointerType === "mouse" && e.button !== 0) return;
      const grid = cell.parentElement;
      if (!grid) return;
      const r0 = cell.getBoundingClientRect();
      const ox = r0.left, oy = r0.top, sx = e.clientX, sy = e.clientY;
      let tx = 0, ty = 0, live = false;
      cell.setPointerCapture(e.pointerId);

      const move = (ev: PointerEvent) => {
        if (!live) {
          if (Math.abs(ev.clientX - sx) + Math.abs(ev.clientY - sy) < 8) return;
          live = true;
          cell.classList.add("dragging");
          cell.style.pointerEvents = "none";
        }
        const over = (document.elementFromPoint(ev.clientX, ev.clientY) as HTMLElement | null)?.closest(".cell");
        if (over && over !== cell && over.parentElement === grid) {
          const kids = Array.from(grid.children);
          if (kids.indexOf(cell) < kids.indexOf(over)) grid.insertBefore(cell, over.nextSibling);
          else grid.insertBefore(cell, over);
        }
        const rr = cell.getBoundingClientRect();
        tx = ox + ev.clientX - sx - (rr.left - tx);
        ty = oy + ev.clientY - sy - (rr.top - ty);
        cell.style.transform = `translate(${tx}px, ${ty}px)`;
      };
      const up = () => {
        cell.removeEventListener("pointermove", move);
        cell.removeEventListener("pointerup", up);
        cell.removeEventListener("pointercancel", up);
        cell.style.transform = "";
        cell.style.pointerEvents = "";
        cell.classList.remove("dragging");
        if (!live) return;
        const order = Array.from(grid.children).map((c) => (c as HTMLElement).dataset.id!);
        update((d) => {
          const list: Item[] = listId === "dock"
            ? (d.dock as Item[])
            : d.pages.find((p) => p.id === listId)?.items ?? [];
          const by = new Map(list.map((x) => [x.id, x]));
          list.length = 0;
          for (const id of order) { const v = by.get(id); if (v) list.push(v); }
        });
      };
      cell.addEventListener("pointermove", move);
      cell.addEventListener("pointerup", up);
      cell.addEventListener("pointercancel", up);
    });
  }, []);

  const openMenu = useCallback((item: Item, x: number, y: number) => {
    setMenu({ item, x: Math.min(x, window.innerWidth - 224), y: Math.min(y, window.innerHeight - 230) });
  }, []);

  useEffect(() => {
    const close = (e: PointerEvent) => {
      if (!(e.target as HTMLElement).closest(".menu")) setMenu(null);
    };
    const key = (e: KeyboardEvent) => {
      if (e.key === "Escape") { setMenu(null); setFolder(null); setSheet("none"); setSearching(false); }
      if (e.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "")) {
        e.preventDefault();
        setSearching(true);
      }
    };
    window.addEventListener("pointerdown", close, true);
    window.addEventListener("keydown", key);
    return () => {
      window.removeEventListener("pointerdown", close, true);
      window.removeEventListener("keydown", key);
    };
  }, []);

  if (!doc) {
    return <div className="shell"><div className="empty">Abriendo tu estante…</div></div>;
  }

  const sheetOpen = sheet !== "none" || folder !== null;
  const grid = doc.settings.view === "grid";

  const Cell = ({ item, listId }: { item: Item; listId: string }) => (
    <div className="cell" data-id={item.id} ref={(el) => bindDrag(el, listId)}>
      {isFolder(item) ? (
        <button className="tile" onClick={() => { if (!edit) setFolder(item); }}
                onContextMenu={(e) => { e.preventDefault(); openMenu(item, e.clientX, e.clientY); }}>
          <Ico item={item} />
          <span className="lbl">{item.name}</span>
        </button>
      ) : (
        <a className="tile" href={item.url} target="_blank" rel="noopener noreferrer"
           onClick={(e) => { e.preventDefault(); if (!edit) launch(item); }}
           onContextMenu={(e) => { e.preventDefault(); openMenu(item, e.clientX, e.clientY); }}
           onPointerDown={(e) => {
             if (e.pointerType === "mouse") return;
             const t = setTimeout(() => openMenu(item, e.clientX, e.clientY), 460);
             const clear = () => clearTimeout(t);
             e.currentTarget.addEventListener("pointerup", clear, { once: true });
             e.currentTarget.addEventListener("pointermove", clear, { once: true });
             e.currentTarget.addEventListener("pointercancel", clear, { once: true });
           }}>
          <Ico item={item} />
          <span className="lbl">{item.name}</span>
        </a>
      )}
      <button className="kill" aria-label={`Quitar ${item.name}`}
              onClick={(e) => { e.stopPropagation(); remove(item.id); }}>
        <Icon name="x" />
      </button>
    </div>
  );

  return (
    <>
      <GlassDefs />

      <div className="shell">
        <header className="topbar">
          <nav className="chips glass" aria-label="Páginas">
            <div className="glass-refract" />
            {doc.pages.map((p, i) => (
              <button key={p.id} className="chip glass-body" aria-selected={i === page}
                      role="tab"
                      onClick={() => {
                        setPage(i);
                        const t = trackRef.current;
                        if (t) t.scrollTo({ left: i * t.clientWidth, behavior: "smooth" });
                      }}>
                {p.name}<span className="n tnum">{p.items.length}</span>
              </button>
            ))}
          </nav>

          {edit ? (
            <button className="btn" style={{ height: 44 }} onClick={() => setEdit(false)}>Listo</button>
          ) : (
            <>
              <button className="iconbtn glass" onClick={() => setSheet("add")} aria-label="Añadir app">
                <div className="glass-refract" />
                <Icon name="plus" className="glass-body" />
              </button>
              <button className="iconbtn glass" onClick={() => setSheet("settings")} aria-label="Ajustes">
                <div className="glass-refract" />
                <Icon name="gear" className="glass-body" />
              </button>
            </>
          )}
        </header>

        {grid ? (
          <div className="pager">
            <div className="track" ref={trackRef}
                 onScroll={(e) => {
                   const t = e.currentTarget;
                   const i = Math.round(t.scrollLeft / Math.max(1, t.clientWidth));
                   if (i !== page && doc.pages[i]) setPage(i);
                 }}>
              {doc.pages.map((p) => (
                <section className="page" key={p.id} aria-label={p.name}>
                  {p.items.length === 0 ? (
                    <p className="empty">Esta página está vacía.<br />Pulsa el más para traer algo.</p>
                  ) : (
                    <div className="grid">
                      {p.items.map((it) => <Cell key={it.id} item={it} listId={p.id} />)}
                    </div>
                  )}
                </section>
              ))}
            </div>
          </div>
        ) : (
          <div className="pager">
            <div className="page" style={{ width: "100%", flex: 1 }}>
              <div className="rows">
                {doc.pages.map((p) => (
                  <div className="rowgrp" key={p.id}>
                    <div className="rowhead"><span>{p.name}</span><span className="tnum">{p.items.length}</span></div>
                    {p.items.map((it) =>
                      isFolder(it) ? (
                        <button className="row" key={it.id} onClick={() => setFolder(it)}>
                          <Ico item={it} />
                          <span className="nm">{it.name}</span>
                          <span className="hs">{it.items.length} apps</span>
                        </button>
                      ) : (
                        <Row key={it.id} item={it} onOpen={() => launch(it)} />
                      ),
                    )}
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        <Dock dock={doc.dock} searching={searching} query={query} results={results}
              onToggleSearch={() => { setSearching((v) => !v); setQuery(""); }}
              onQuery={setQuery}
              onOpen={(it) => { launch(it); setSearching(false); setQuery(""); }}
              onContext={openMenu} />
      </div>

      <div className="scrim" data-open={sheetOpen} onClick={() => { setSheet("none"); setFolder(null); }} />

      {folder && (
        <div className="sheet glass glass-solid" data-open={true} role="dialog" aria-modal="true" aria-label={folder.name}>
          <div className="glass-refract" />
          <div className="glass-body">
            <button className="grab" onClick={() => setFolder(null)} aria-label="Cerrar" />
            <h2>{folder.name}</h2>
            <p className="sub">{folder.items.length} apps</p>
            <div className="grid" style={{ paddingBottom: 8 }}>
              {folder.items.map((it) => <Cell key={it.id} item={it} listId={folder.id} />)}
            </div>
          </div>
        </div>
      )}

      <SettingsSheet open={sheet === "settings"} onClose={() => setSheet("none")} doc={doc}
                     onOrganise={() => setEdit(true)} onToast={say} />
      <AddSheet open={sheet === "add"} onClose={() => setSheet("none")} doc={doc} page={page} onToast={say} />
      <EditSheet open={sheet === "edit"} onClose={() => setSheet("none")} doc={doc} item={target}
                 onToast={say} onRemove={remove} />

      <div className="menu glass glass-solid" data-open={menu !== null} role="menu"
           style={{ left: menu?.x ?? 0, top: menu?.y ?? 0 }}>
        <div className="glass-refract" />
        <div className="glass-body">
          {menu && !isFolder(menu.item) && (
            <button onClick={() => { launch(menu.item as AppItem); setMenu(null); }}>
              <Icon name="open" />Abrir
            </button>
          )}
          <button onClick={() => { if (menu) { setTarget(menu.item); setSheet("edit"); } setMenu(null); }}>
            <Icon name="edit" />Editar
          </button>
          <button onClick={() => { setEdit(true); setMenu(null); }}>
            <Icon name="move" />Reordenar
          </button>
          <hr />
          <button className="warn" onClick={() => { if (menu) remove(menu.item.id); setMenu(null); }}>
            <Icon name="x" />Quitar del estante
          </button>
        </div>
      </div>

      <div className="toast glass glass-solid" data-open={toast !== ""} role="status">
        <div className="glass-body">{toast}</div>
      </div>
    </>
  );
}
