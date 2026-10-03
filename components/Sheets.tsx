"use client";

import { useEffect, useRef, useState, type ReactNode, type FormEvent } from "react";
import { app, uid } from "@/lib/defaults";
import { fetchIcon, hydrateIcons, type Resolved } from "@/lib/icon-client";
import { exportJson, importJson, setSetting, update, getDoc } from "@/lib/store";
import { isFolder, type AppItem, type Doc, type Item } from "@/lib/types";
import { Icon } from "@/lib/glyphs";
import { Ico, hostOf } from "./Tile";

export function SheetDialog({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: ReactNode; label: string;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  useEffect(() => {
    const dialog = ref.current;
    if (!dialog) return;
    if (open && !dialog.open) dialog.showModal();
    if (!open && dialog.open) dialog.close();
  }, [open]);
  return <dialog ref={ref} className="sheet" aria-label={label}
    onCancel={(e) => { e.preventDefault(); onClose(); }}
    onClick={(e) => {
      if (e.target !== e.currentTarget) return;
      const r = e.currentTarget.getBoundingClientRect();
      if (e.clientX < r.left || e.clientX > r.right || e.clientY < r.top || e.clientY > r.bottom) onClose();
    }}>
    <button className="sheet-close m3-icon-btn" type="button" onClick={onClose} aria-label="Cerrar"><Icon name="x" /></button>
    {children}
  </dialog>;
}

export function SettingsSheet({ open, onClose, doc, onOrganise, onToast }: {
  open: boolean; onClose: () => void; doc: Doc; onOrganise: () => void; onToast: (message: string) => void;
}) {
  const [json, setJson] = useState("");
  const [busy, setBusy] = useState(false);
  const [confirmImport, setConfirmImport] = useState(false);
  return <SheetDialog open={open} onClose={onClose} label="Ajustes">
    <h2>Ajustes</h2><p className="sub">Tus enlaces se guardan en este dispositivo.</p>
    <div className="grp"><h3>Vista</h3><div className="seg">
      {(["grid", "list"] as const).map((view) => <button key={view} aria-pressed={doc.settings.view === view}
        onClick={() => setSetting("view", view)}>{view === "grid" ? "Iconos" : "Lista"}</button>)}
    </div></div>
    <div className="grp"><h3>Tema</h3><div className="seg">
      {(["system", "light", "dark"] as const).map((theme, i) => <button key={theme} aria-pressed={doc.settings.theme === theme}
        onClick={() => setSetting("theme", theme)}>{["Sistema", "Claro", "Oscuro"][i]}</button>)}
    </div></div>
    <button className="btn ghost" onClick={() => { onOrganise(); onClose(); }}>Organizar accesos</button>
    <details className="grp advanced"><summary>Copia de seguridad e iconos</summary>
      <p className="hint">Exporta tus enlaces para guardarlos o llevarlos a otro dispositivo.</p>
      <div className="btns">
        <button className="btn ghost" onClick={() => {
          const text = exportJson(); setJson(text);
          void navigator.clipboard?.writeText(text).then(() => onToast("Copia guardada en el portapapeles"), () => onToast("Copia lista abajo"));
        }}>Exportar</button>
        <button className="btn ghost" disabled={!json.trim()} onClick={() => setConfirmImport(true)}>Importar</button>
      </div>
      {confirmImport && <div className="confirm-box"><p>La copia reemplazará tus enlaces actuales.</p><div className="btns">
        <button className="btn" onClick={() => { const ok = importJson(json); setConfirmImport(false); const imported = getDoc(); if (ok && imported) void hydrateIcons(imported); onToast(ok ? "Copia importada" : "No se pudo leer esa copia"); }}>Reemplazar enlaces</button>
        <button className="btn ghost" onClick={() => setConfirmImport(false)}>Cancelar</button>
      </div></div>}
      <textarea className="field" value={json} onChange={(e) => setJson(e.target.value)} aria-label="Copia de seguridad" spellCheck={false} placeholder="Pega aquí una copia para importarla" />
      <button className="btn ghost" disabled={busy} onClick={async () => {
        setBusy(true);
        try { const result = await hydrateIcons(doc, undefined, { force: true }); onToast(`${result.ok} de ${result.total} iconos actualizados`); }
        finally { setBusy(false); }
      }}>{busy ? "Buscando iconos…" : "Actualizar iconos de los sitios"}</button>
    </details>
  </SheetDialog>;
}

function normUrl(raw: string): string {
  const value = raw.trim();
  if (!value) return "";
  try {
    const url = new URL(/^[a-z][a-z\d+.-]*:/i.test(value) ? value : `https://${value}`);
    if (!/^https?:$/.test(url.protocol) || !url.hostname.includes(".") || url.username || url.password) return "";
    return url.href;
  } catch { return ""; }
}

export function AddSheet({ open, onClose, doc, page, onToast }: {
  open: boolean; onClose: () => void; doc: Doc; page: number; onToast: (message: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [name, setName] = useState("");
  const [dest, setDest] = useState("");
  const [peek, setPeek] = useState<{ url: string; result: Resolved } | null>(null);
  const [looking, setLooking] = useState(false);
  const [error, setError] = useState("");
  const initialDestination = doc.pages[page]?.id ?? doc.pages[0]?.id ?? "";
  useEffect(() => { if (open) { setDest(initialDestination); setError(""); } }, [open, initialDestination]);
  useEffect(() => {
    setPeek(null);
    const candidate = normUrl(url);
    if (!open || !candidate) { setLooking(false); return; }
    const ctrl = new AbortController();
    setLooking(true);
    const timer = setTimeout(async () => {
      const result = await fetchIcon(candidate, ctrl.signal);
      if (ctrl.signal.aborted) return;
      setPeek({ url: candidate, result }); setLooking(false);
    }, 450);
    return () => { clearTimeout(timer); ctrl.abort(); };
  }, [url, open]);
  const commit = (event: FormEvent) => {
    event.preventDefault();
    const address = normUrl(url);
    if (!address) { setError("Escribe una dirección web válida (http o https)."); return; }
    const resolved = peek?.url === address && peek.result.ok ? peek.result : null;
    const fresh = app(name.trim() || resolved?.name || hostOf(address), address, "globe", "#737970");
    if (resolved) Object.assign(fresh, { icon: resolved.icon, iconSource: resolved.source, iconUrl: resolved.iconUrl, iconVersion: 1, iconTried: true });
    update((draft) => {
      const collection = draft.pages.find((p) => p.id === dest) ?? draft.pages[0];
      if (collection) collection.items.push(fresh);
      else draft.pages.push({ id: uid(), name: "Mis enlaces", items: [fresh] });
    });
    void hydrateIcons({ ...doc, dock: [], pages: [{ id: dest, name: "", items: [fresh] }] });
    setUrl(""); setName(""); setPeek(null); onClose(); onToast("Enlace añadido");
  };
  return <SheetDialog open={open} onClose={onClose} label="Añadir enlace"><h2>Añadir enlace</h2>
    <p className="sub">Guarda un sitio que uses a menudo.</p>
    <form onSubmit={commit}>
      <label className="form-label">Dirección<input className="field" value={url} onChange={(e) => { setUrl(e.target.value); setError(""); }} placeholder="ejemplo.com" inputMode="url" autoComplete="url" autoCapitalize="none" spellCheck={false} required /></label>
      {error && <p className="hint error" role="alert">{error}</p>}
      {looking && <p className="hint" role="status">Buscando el icono del sitio…</p>}
      {!looking && peek?.result.ok && <div className="iconrow"><Ico item={{ id: "preview", type: "app", name: peek.result.name, url: peek.url, g: "globe", c: "", icon: peek.result.icon }} /><span>{peek.result.name || hostOf(peek.url)}</span></div>}
      {!looking && peek && !peek.result.ok && <p className="hint">Sin icono disponible. Puedes guardar el enlace igualmente.</p>}
      <label className="form-label">Nombre <small>(opcional)</small><input className="field" value={name} onChange={(e) => setName(e.target.value)} placeholder={peek?.result.ok ? peek.result.name : "Nombre del sitio"} /></label>
      <label className="form-label">Colección<select className="field" value={dest} onChange={(e) => setDest(e.target.value)}>{doc.pages.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}</select></label>
      <div className="btns"><button className="btn" type="submit">Guardar enlace</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
    </form>
  </SheetDialog>;
}

function locationOf(doc: Doc, id: string) {
  if (doc.dock.some((item) => item.id === id)) return "dock";
  for (const page of doc.pages) {
    if (page.items.some((item) => item.id === id)) return page.id;
    for (const item of page.items) if (isFolder(item) && item.items.some((child) => child.id === id)) return item.id;
  }
  return doc.pages[0]?.id ?? "";
}

export function EditSheet(props: { open: boolean; onClose: () => void; doc: Doc; item: Item | null; onToast: (message: string) => void; onRemove: (id: string) => void }) {
  return <SheetDialog open={props.open && !!props.item} onClose={props.onClose} label="Editar enlace">
    {props.open && props.item && <EditForm key={props.item.id} {...props} item={props.item} />}
  </SheetDialog>;
}

function EditForm({ doc, item, onClose, onToast }: { doc: Doc; item: Item; onClose: () => void; onToast: (message: string) => void }) {
  const [name, setName] = useState(item.name);
  const [url, setUrl] = useState(isFolder(item) ? "" : item.url);
  const [dest, setDest] = useState(locationOf(doc, item.id));
  const [error, setError] = useState("");
  const save = (event: FormEvent) => {
    event.preventDefault();
    const address = isFolder(item) ? "" : normUrl(url);
    if (!isFolder(item) && !address) { setError("Escribe una dirección web válida."); return; }
    let refreshed: AppItem | undefined;
    update((draft) => {
      const lists: Item[][] = [draft.dock, ...draft.pages.flatMap((p) => [p.items, ...p.items.filter(isFolder).map((f) => f.items)])];
      const source = lists.find((list) => list.some((entry) => entry.id === item.id));
      const hit = source?.find((entry) => entry.id === item.id);
      if (!hit || !source) return;
      hit.name = name.trim() || hit.name;
      if (!isFolder(hit) && hit.url !== address) {
        hit.url = address; delete hit.icon; delete hit.iconSource; delete hit.iconUrl; delete hit.provenance; delete hit.iconVersion; delete hit.iconTried;
        refreshed = { ...hit };
      }
      const destinationFolder = draft.pages.flatMap((p) => p.items).find((entry) => entry.id === dest && isFolder(entry));
      const destination = dest === "dock" ? draft.dock : draft.pages.find((p) => p.id === dest)?.items ?? (destinationFolder && isFolder(destinationFolder) ? destinationFolder.items : undefined);
      if (destination && destination !== source && !(isFolder(hit) && dest === "dock")) {
        source.splice(source.indexOf(hit), 1); (destination as Item[]).push(hit);
      }
    });
    if (refreshed) void hydrateIcons({ ...doc, dock: [refreshed], pages: [] });
    onClose(); onToast("Enlace guardado");
  };
  return <form onSubmit={save}><h2>{isFolder(item) ? "Editar carpeta" : "Editar enlace"}</h2>
    <label className="form-label">Nombre<input className="field" value={name} onChange={(e) => setName(e.target.value)} required /></label>
    {!isFolder(item) && <label className="form-label">Dirección<input className="field" value={url} onChange={(e) => setUrl(e.target.value)} inputMode="url" autoCapitalize="none" spellCheck={false} required /></label>}
    {error && <p className="hint error" role="alert">{error}</p>}
    <label className="form-label">Ubicación<select className="field" value={dest} onChange={(e) => setDest(e.target.value)}>
      {!isFolder(item) && <option value="dock">Fijadas</option>}
      {doc.pages.map((page) => <option key={page.id} value={page.id}>{page.name}</option>)}
      {!isFolder(item) && doc.pages.flatMap((page) => page.items.filter(isFolder).map((folder) => <option key={folder.id} value={folder.id}>{page.name} · {folder.name}</option>))}
    </select></label>
    <div className="btns"><button className="btn" type="submit">Guardar</button><button className="btn ghost" type="button" onClick={onClose}>Cancelar</button></div>
  </form>;
}

export function Ghost({ item }: { item: Item }) { return <Ico item={item} />; }
