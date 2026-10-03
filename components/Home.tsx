"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Glyph, Icon } from "@/lib/glyphs";
import { fetchIcon, hydrateIcons } from "@/lib/icon-client";
import { boot, update, useDoc } from "@/lib/store";
import { isFolder, type AppItem, type Doc, type Folder, type Item } from "@/lib/types";
import { AddSheet, EditSheet, SettingsSheet, SheetDialog } from "./Sheets";
import Shortcut, {
  type ShortcutDragEndPayload,
  type ShortcutDragMovePayload,
  type ShortcutDragPayload,
  type ShortcutMenuPosition,
} from "./Shortcut";
import { hostOf } from "./Tile";

type Sheet = "none" | "settings" | "add" | "edit";
type Menu = { item: Item; x: number; y: number; restore: HTMLElement | null } | null;
type Removed = { item: Item; listId: string; index: number };
type DropTarget = { listId: string; itemId: string | null; after: boolean } | null;
type DragState = ShortcutDragPayload & {
  targetListId: string | null;
  targetId: string | null;
  after: boolean;
};

/** Every app in the document, including links nested inside folders. */
function flatten(doc: Doc) {
  const out: { item: AppItem; where: string }[] = [];
  for (const item of doc.dock) out.push({ item, where: "Fijadas" });
  for (const page of doc.pages) {
    for (const item of page.items) {
      if (isFolder(item)) {
        for (const nested of item.items) out.push({ item: nested, where: `${page.name} · ${item.name}` });
      } else {
        out.push({ item, where: page.name });
      }
    }
  }
  return out;
}

function findFolder(doc: Doc, id: string | null): Folder | null {
  if (!id) return null;
  for (const page of doc.pages) {
    const folder = page.items.find((item): item is Folder => isFolder(item) && item.id === id);
    if (folder) return folder;
  }
  return null;
}

function findItem(doc: Doc, id: string | null): Item | null {
  if (!id) return null;
  const dockItem = doc.dock.find((item) => item.id === id);
  if (dockItem) return dockItem;
  for (const page of doc.pages) {
    const item = page.items.find((candidate) => candidate.id === id);
    if (item) return item;
    for (const candidate of page.items) {
      if (isFolder(candidate)) {
        const nested = candidate.items.find((child) => child.id === id);
        if (nested) return nested;
      }
    }
  }
  return null;
}

/** Resolve a dock, page, or folder list from its stable id. */
function findList(doc: Doc, id: string): Item[] | null {
  if (id === "dock") return doc.dock as Item[];
  for (const page of doc.pages) {
    if (page.id === id) return page.items;
    for (const item of page.items) {
      if (isFolder(item) && item.id === id) return item.items;
    }
  }
  return null;
}

function locateItem(doc: Doc, id: string): { item: Item; listId: string; index: number } | null {
  const dockIndex = doc.dock.findIndex((item) => item.id === id);
  if (dockIndex >= 0) return { item: doc.dock[dockIndex], listId: "dock", index: dockIndex };
  for (const page of doc.pages) {
    const index = page.items.findIndex((item) => item.id === id);
    if (index >= 0) return { item: page.items[index], listId: page.id, index };
    for (const folder of page.items) {
      if (!isFolder(folder)) continue;
      const nestedIndex = folder.items.findIndex((item) => item.id === id);
      if (nestedIndex >= 0) return { item: folder.items[nestedIndex], listId: folder.id, index: nestedIndex };
    }
  }
  return null;
}

function moveItem(
  doc: Doc,
  sourceListId: string,
  itemId: string,
  targetListId: string,
  targetId: string | null,
  after: boolean,
) {
  const source = findList(doc, sourceListId);
  const target = findList(doc, targetListId);
  if (!source || !target) return;
  const sourceIndex = source.findIndex((item) => item.id === itemId);
  if (sourceIndex < 0) return;
  const moving = source[sourceIndex];
  // The dock is intentionally a list of links, never a folder.
  if (targetListId === "dock" && isFolder(moving)) return;
  if (source === target && targetId === itemId) return;

  source.splice(sourceIndex, 1);
  let index = targetId ? target.findIndex((item) => item.id === targetId) : target.length;
  if (index < 0) index = target.length;
  if (after) index += 1;
  target.splice(Math.max(0, Math.min(index, target.length)), 0, moving);
}

function readDropTarget(clientX: number, clientY: number): DropTarget {
  const hit = document.elementFromPoint(clientX, clientY) as HTMLElement | null;
  if (!hit) return null;
  const cell = hit.closest<HTMLElement>("[data-shortcut-id]");
  if (cell?.dataset.listId) {
    const rect = cell.getBoundingClientRect();
    const isRow = cell.classList.contains("shortcut-row");
    return {
      listId: cell.dataset.listId,
      itemId: cell.dataset.shortcutId ?? null,
      after: isRow
        ? clientY > rect.top + rect.height / 2
        : clientX > rect.left + rect.width / 2,
    };
  }
  const list = hit.closest<HTMLElement>("[data-drop-list]");
  return list?.dataset.dropList ? { listId: list.dataset.dropList, itemId: null, after: false } : null;
}

function ActionMenu({
  menu,
  onClose,
  onOpenFolder,
  onRefresh,
  onEdit,
  onOrganise,
  onRemove,
}: {
  menu: Menu;
  onClose: () => void;
  onOpenFolder: (folder: Folder) => void;
  onRefresh: (item: AppItem) => void;
  onEdit: (item: Item) => void;
  onOrganise: () => void;
  onRemove: (id: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const previousFocus = useRef<HTMLElement | null>(null);
  const [position, setPosition] = useState({ x: menu?.x ?? 8, y: menu?.y ?? 8 });

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (!menu) {
      if (dialog.open) dialog.close();
      const restore = previousFocus.current;
      previousFocus.current = null;
      restore?.focus();
      return;
    }

    previousFocus.current = menu.restore ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null);
    setPosition({ x: menu.x, y: menu.y });
    if (!dialog.open) {
      try {
        dialog.showModal();
      } catch {
        // A browser may reject showModal when a stale dialog is still closing.
        return;
      }
    }

    requestAnimationFrame(() => {
      const rect = dialog.getBoundingClientRect();
      const width = rect.width || 224;
      const height = rect.height || 220;
      const x = Math.max(8, Math.min(menu.x, window.innerWidth - width - 8));
      const y = Math.max(8, Math.min(menu.y, window.innerHeight - height - 8));
      setPosition({ x, y });
      requestAnimationFrame(() => {
        dialog.querySelector<HTMLElement>("button, a")?.focus();
      });
    });
  }, [menu]);

  const onCancel = (event: React.SyntheticEvent<HTMLDialogElement>) => {
    event.preventDefault();
    onClose();
  };
  const folderItem = menu && isFolder(menu.item) ? menu.item : null;
  const appItem = menu && !isFolder(menu.item) ? menu.item : null;

  return (
    <dialog
      ref={dialogRef}
      className="menu menu-dialog"
      data-open={menu !== null}
      aria-label={menu ? `Opciones de ${menu.item.name}` : "Opciones"}
      style={{ left: position.x, top: position.y, margin: 0 }}
      onCancel={onCancel}
      onPointerDown={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      {menu && (
        <>
          {folderItem ? (
            <button type="button" onClick={() => { onOpenFolder(folderItem); onClose(); }}>
              <Glyph name="folder" />Abrir carpeta
            </button>
          ) : appItem ? (
            <>
              <a
                className="menu-option"
                href={appItem.url}
                target="_blank"
                rel="noopener noreferrer"
                onClick={onClose}
              >
                <Icon name="open" />Abrir en el navegador
              </a>
              <button type="button" onClick={() => { onRefresh(appItem); onClose(); }}>
                <Icon name="down" />Actualizar icono del sitio
              </button>
            </>
          ) : null}
          <button type="button" onClick={() => { onEdit(menu.item); onClose(); }}>
            <Icon name="edit" />Editar
          </button>
          <button type="button" onClick={() => { onOrganise(); onClose(); }}>
            <Icon name="move" />Organizar
          </button>
          <hr />
          <button type="button" className="warn" onClick={() => { onRemove(menu.item.id); onClose(); }}>
            <Icon name="x" />Quitar del estante
          </button>
        </>
      )}
    </dialog>
  );
}

export default function Home() {
  const doc = useDoc();
  const [page, setPage] = useState(0);
  const [edit, setEdit] = useState(false);
  const [query, setQuery] = useState("");
  const [sheet, setSheet] = useState<Sheet>("none");
  const [targetId, setTargetId] = useState<string | null>(null);
  const [menu, setMenu] = useState<Menu>(null);
  const [folderId, setFolderId] = useState<string | null>(null);
  const [toast, setToast] = useState("");
  const [undo, setUndo] = useState<Removed | null>(null);
  const [drag, setDrag] = useState<DragState | null>(null);
  const searchInputRef = useRef<HTMLInputElement>(null);
  const toastTimer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const hydrated = useRef(false);
  const dragRef = useRef<DragState | null>(null);

  useEffect(() => { void boot(); }, []);

  const say = useCallback((message: string) => {
    setUndo(null);
    setToast(message);
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => setToast(""), 2200);
  }, []);

  useEffect(() => () => clearTimeout(toastTimer.current), []);

  useEffect(() => {
    if (!doc) return;
    const settings = doc.settings;
    const root = document.documentElement;
    root.style.setProperty("--cols", String(settings.cols));
    root.style.setProperty("--scale", String(settings.scale));
    root.style.setProperty("--row-gap", settings.labels === "on" ? "20px" : "24px");
    root.dataset.wp = settings.wp;
    root.dataset.shape = settings.shape;
    root.dataset.labels = settings.labels;
    root.dataset.refract = settings.refract;
    if (settings.theme === "system") delete root.dataset.theme;
    else root.dataset.theme = settings.theme;
  }, [doc]);

  useEffect(() => {
    document.documentElement.dataset.edit = edit ? "1" : "0";
    if (!edit) {
      dragRef.current = null;
      setDrag(null);
    }
  }, [edit]);

  useEffect(() => {
    if (!doc || hydrated.current) return;
    hydrated.current = true;
    void hydrateIcons(doc);
  }, [doc]);

  const refreshIcon = useCallback(async (item: AppItem) => {
    say(`Buscando el icono de ${item.name}`);
    const expectedUrl = item.url;
    const result = await fetchIcon(expectedUrl);
    if (!result.ok) {
      say(`Sin icono utilizable en ${hostOf(item.url)}`);
      return;
    }
    update((draft) => {
      for (const list of [draft.dock, ...draft.pages.map((pageItem) => pageItem.items)]) {
        for (const candidate of list) {
          if (candidate.id === item.id && candidate.type === "app" && candidate.url === expectedUrl) {
            candidate.icon = result.icon;
            candidate.iconUrl = result.iconUrl;
            candidate.iconSource = result.source;
            candidate.provenance = result.provenance ?? result.source;
            candidate.iconVersion = 1;
            candidate.iconTried = true;
            return;
          }
          if (candidate.type === "folder") {
            const nested = candidate.items.find((child) => child.id === item.id);
            if (nested && nested.url === expectedUrl) {
              nested.icon = result.icon;
              nested.iconUrl = result.iconUrl;
              nested.iconSource = result.source;
              nested.iconTried = true;
              nested.provenance = result.provenance ?? result.source;
              nested.iconVersion = 1;
              return;
            }
          }
        }
      }
    });
    say(`Icono de ${result.name || item.name} actualizado`);
  }, [say]);

  const remove = useCallback((id: string) => {
    let removed: Removed | null = null;
    update((draft) => {
      const found = locateItem(draft, id);
      if (!found) return;
      removed = { item: structuredClone(found.item), listId: found.listId, index: found.index };
      const list = findList(draft, found.listId);
      list?.splice(found.index, 1);
    });
    if (!removed) return;
    // Keep the undo action above the document's inert dialog backdrop.
    setFolderId(null);
    setUndo(removed);
    setToast("Sitio quitado");
    clearTimeout(toastTimer.current);
    toastTimer.current = setTimeout(() => {
      setToast("");
      setUndo(null);
    }, 5000);
  }, []);

  const undoRemove = useCallback(() => {
    if (!undo) return;
    const pending = undo;
    update((draft) => {
      const list = findList(draft, pending.listId);
      if (list) list.splice(Math.min(pending.index, list.length), 0, pending.item);
    });
    setUndo(null);
    say("Sitio restaurado");
  }, [say, undo]);

  const results = useMemo(() => {
    if (!doc) return [];
    const value = query.trim().toLowerCase();
    if (!value) return [];
    return flatten(doc)
      .filter(({ item }) => `${item.name} ${item.url}`.toLowerCase().includes(value))
      .slice(0, 8)
      .map(({ item }) => item);
  }, [doc, query]);

  const onDragStart = useCallback((payload: ShortcutDragPayload) => {
    if (!payload.listId) return;
    const drop = readDropTarget(payload.clientX, payload.clientY);
    const next: DragState = {
      ...payload,
      targetListId: drop?.listId ?? payload.listId,
      targetId: drop?.itemId ?? payload.itemId,
      after: drop?.after ?? false,
    };
    dragRef.current = next;
    setDrag(next);
  }, []);

  const onDragMove = useCallback((payload: ShortcutDragMovePayload) => {
    const current = dragRef.current;
    if (!current || current.itemId !== payload.itemId) return;
    const drop = readDropTarget(payload.clientX, payload.clientY);
    const next: DragState = {
      ...current,
      ...payload,
      targetListId: drop?.listId ?? current.targetListId,
      targetId: drop?.itemId ?? current.targetId,
      after: drop?.after ?? current.after,
    };
    dragRef.current = next;
    if (
      current.targetListId !== next.targetListId
      || current.targetId !== next.targetId
      || current.after !== next.after
    ) setDrag(next);
  }, []);

  const finishDrag = useCallback((payload: ShortcutDragEndPayload) => {
    const current = dragRef.current;
    if (!current) return;
    const drop = payload.cancelled ? null : readDropTarget(payload.clientX, payload.clientY);
    const targetListId = drop?.listId ?? current.targetListId;
    const targetId = drop?.itemId ?? current.targetId;
    const after = drop?.after ?? current.after;
    if (!payload.cancelled && targetListId) {
      update((draft) => moveItem(draft, current.listId, current.itemId, targetListId, targetId, after));
    }
    dragRef.current = null;
    setDrag(null);
  }, []);

  const cancelDrag = useCallback(() => {
    dragRef.current = null;
    setDrag(null);
  }, []);

  const openMenu = useCallback((item: Item, position: ShortcutMenuPosition, restore: HTMLElement | null) => {
    setMenu({ item, x: position.x, y: position.y, restore });
  }, []);

  const openFolder = useCallback((folder: Folder) => setFolderId(folder.id), []);

  const currentFolder = useMemo(() => (doc ? findFolder(doc, folderId) : null), [doc, folderId]);
  const target = useMemo(() => (doc ? findItem(doc, targetId) : null), [doc, targetId]);

  useEffect(() => {
    const key = (event: KeyboardEvent) => {
      if (event.key === "/" && !/input|textarea|select/i.test(document.activeElement?.tagName ?? "")) {
        event.preventDefault();
        searchInputRef.current?.focus();
      }
    };
    window.addEventListener("keydown", key);
    return () => window.removeEventListener("keydown", key);
  }, []);

  if (!doc) {
    return (
      <div className="shell flex items-center justify-center min-h-screen">
        <div className="text-on-surface-variant font-medium">Abriendo tu estante…</div>
      </div>
    );
  }

  const isGridView = doc.settings.view === "grid";
  const currentPage = page === -1 ? null : doc.pages[page] ?? doc.pages[0];
  const itemCount = doc.dock.length + doc.pages.reduce((total, current) => total + current.items.length, 0);
  const canOrganise = itemCount > 1;

  const shortcut = (item: Item, listId: string | undefined, variant: "tile" | "row" = "tile") => (
    <Shortcut
      key={item.id}
      item={item}
      listId={listId}
      variant={variant}
      edit={edit}
      dragging={drag?.itemId === item.id}
      dragOver={drag?.targetId === item.id && drag?.targetListId === listId}
      onOpenFolder={openFolder}
      onMenu={openMenu}
      onDragStart={onDragStart}
      onDragMove={onDragMove}
      onDragEnd={finishDrag}
      onDragCancel={cancelDrag}
    />
  );

  return (
    <>
      <main className="shell" id="content" tabIndex={-1}>
        <h1 className="sr-only">Estante</h1>
        <search className="m3-search-bar">
          <button className="m3-icon-btn" type="button" aria-label="Buscar en tu estante" onClick={() => searchInputRef.current?.focus()}>
            <Icon name="search" style={{ width: 22, height: 22 }} />
          </button>
          <input
            ref={searchInputRef}
            className="m3-search-input"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Buscar en tu estante"
            aria-label="Buscar en tu estante"
          />
          <div className="m3-header-actions">
            {query && (
              <button className="m3-icon-btn" type="button" aria-label="Limpiar búsqueda" onClick={() => setQuery("")}>
                <Icon name="x" style={{ width: 20, height: 20 }} />
              </button>
            )}
            <button className="m3-icon-btn" type="button" aria-label="Añadir sitio" onClick={() => setSheet("add")}>
              <Icon name="plus" style={{ width: 20, height: 20 }} />
            </button>
            <button className="m3-icon-btn" type="button" aria-label="Ajustes" onClick={() => setSheet("settings")}>
              <Icon name="gear" style={{ width: 20, height: 20 }} />
            </button>
          </div>

          {query.trim() && (
            <div className="m3-search-results" data-drop-list="search">
              <p className="cap">Resultados</p>
              {results.length === 0 ? (
                <div className="p-3 text-sm text-on-surface-variant">Sin sitios que coincidan</div>
              ) : (
                results.map((item) => shortcut(item, undefined, "row"))
              )}
            </div>
          )}
        </search>

        <nav className="m3-chips-row no-scrollbar" aria-label="Colecciones">
          <button className={`m3-chip ${page === -1 ? "active" : ""}`} type="button" aria-pressed={page === -1} onClick={() => setPage(-1)}>
            {page === -1 && <Icon name="check" style={{ width: 16, height: 16 }} />}
            <span>Todas</span>
          </button>
          {doc.pages.map((collection, index) => (
            <button key={collection.id} className={`m3-chip ${page === index ? "active" : ""}`} type="button" aria-pressed={page === index} onClick={() => setPage(index)}>
              {page === index && <Icon name="check" style={{ width: 16, height: 16 }} />}
              <span>{collection.name}</span>
            </button>
          ))}
          <button
            className="m3-chip"
            type="button"
            style={{ borderStyle: "dashed" }}
            aria-label="Nueva colección"
            onClick={() => {
              const name = `Colección ${doc.pages.length + 1}`;
              update((draft) => { draft.pages.push({ id: crypto.randomUUID().slice(0, 8), name, items: [] }); });
              setPage(doc.pages.length);
              say("Colección creada");
            }}
          >
            <Icon name="plus" style={{ width: 16, height: 16 }} />
            <span>Nueva</span>
          </button>
        </nav>

        {(doc.dock.length > 0 || edit) && (
          <section className="m3-card" aria-label="Fijadas">
            <div className="m3-card-header">
              <div className="m3-card-title"><h2>Fijadas</h2></div>
            </div>
            <div className="m3-pinned-grid dock" data-drop-list="dock">
              {doc.dock.map((item) => shortcut(item, "dock"))}
            </div>
          </section>
        )}

        <section className="space-y-3">
          <div className="m3-section-head">
            <h2 className="m3-section-title">{currentPage ? currentPage.name : "Todas"}</h2>
            {canOrganise && (
              <button className={`m3-text-btn ${edit ? "active" : ""}`} type="button" onClick={() => setEdit((value) => !value)}>
                {edit ? "Listo" : "Organizar"}
              </button>
            )}
          </div>
          {!edit && itemCount > 0 && <p className="hold-hint">Mantén pulsado un sitio para ver sus opciones.</p>}

          {isGridView ? (
            page === -1 ? (
              <div className="space-y-6">
                {doc.pages.map((collection) => (
                  <div key={collection.id} className="space-y-2" data-drop-list={collection.id}>
                    <div className="text-xs font-bold uppercase tracking-wider text-primary px-1">{collection.name}</div>
                    {collection.items.length === 0 ? (
                      <p className="text-sm text-on-surface-variant p-2">Colección vacía</p>
                    ) : (
                      <div className="grid" data-drop-list={collection.id}>
                        {collection.items.map((item) => shortcut(item, collection.id))}
                      </div>
                    )}
                  </div>
                ))}
              </div>
            ) : currentPage ? (
              currentPage.items.length === 0 ? (
                <div className="p-8 text-center text-on-surface-variant bg-surface-low rounded-3xl border border-outline-variant/30" data-drop-list={currentPage.id}>
                  <p className="text-base font-medium">Esta colección está vacía.</p>
                  <p className="text-sm mt-1">Añade un sitio con el botón «+».</p>
                </div>
              ) : (
                <div className="grid" data-drop-list={currentPage.id}>
                  {currentPage.items.map((item) => shortcut(item, currentPage.id))}
                </div>
              )
            ) : null
          ) : (
            <div className="rows">
              {(page === -1 ? doc.pages : [currentPage].filter(Boolean)).map((collection) => collection && (
                <div className="rowgrp" key={collection.id} data-drop-list={collection.id}>
                  <div className="rowhead"><span>{collection.name}</span></div>
                  {collection.items.map((item) => shortcut(item, collection.id, "row"))}
                </div>
              ))}
            </div>
          )}
        </section>
      </main>

      {currentFolder && (
        <SheetDialog open={true} onClose={() => setFolderId(null)} label={currentFolder.name}>
          <h2>{currentFolder.name}</h2>
          <div className="grid pt-2 pb-4" data-drop-list={currentFolder.id}>
            {currentFolder.items.map((item) => shortcut(item, currentFolder.id))}
          </div>
        </SheetDialog>
      )}

      <SettingsSheet
        open={sheet === "settings"}
        onClose={() => setSheet("none")}
        doc={doc}
        onOrganise={() => setEdit(true)}
        onToast={say}
      />
      <AddSheet
        open={sheet === "add"}
        onClose={() => setSheet("none")}
        doc={doc}
        page={page === -1 ? 0 : page}
        onToast={say}
      />
      <EditSheet
        open={sheet === "edit"}
        onClose={() => { setSheet("none"); setTargetId(null); }}
        doc={doc}
        item={target}
        onToast={say}
        onRemove={remove}
      />

      <ActionMenu
        menu={menu}
        onClose={() => setMenu(null)}
        onOpenFolder={openFolder}
        onRefresh={(item) => { void refreshIcon(item); }}
        onEdit={(item) => { setTargetId(item.id); setSheet("edit"); }}
        onOrganise={() => setEdit(true)}
        onRemove={remove}
      />

      <div className="toast" data-open={toast !== ""} role="status">
        <span>{toast}</span>
        {undo && <button type="button" onClick={undoRemove}>Deshacer</button>}
      </div>
    </>
  );
}
