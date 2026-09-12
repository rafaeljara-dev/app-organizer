"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { CATALOG, SWATCHES } from "@/lib/catalog";
import { fetchIcon, hydrateIcons, type Progress, type Resolved } from "@/lib/icon-client";
import { app, uid } from "@/lib/defaults";
import { Glyph, Icon } from "@/lib/glyphs";
import { exportJson, importJson, resetDoc, setSetting, update } from "@/lib/store";
import { isFolder, type AppItem, type Doc, type Item, type Settings } from "@/lib/types";
import { Ico, hostOf } from "./Tile";

function Seg<T extends string | number | boolean>({
  value, options, onPick,
}: { value: T; options: { v: T; label: string }[]; onPick: (v: T) => void }) {
  return (
    <div className="seg">
      {options.map((o) => (
        <button key={String(o.v)} type="button" aria-pressed={o.v === value}
                onClick={() => onPick(o.v)}>{o.label}</button>
      ))}
    </div>
  );
}

function Shell({ open, onClose, children, label }: {
  open: boolean; onClose: () => void; children: React.ReactNode; label: string;
}) {
  return (
    <div className="sheet glass glass-solid" data-open={open} role="dialog" aria-modal="true" aria-label={label}
         aria-hidden={!open}>
      <div className="glass-refract" />
      <div className="glass-body">
        <button className="grab" onClick={onClose} aria-label="Cerrar" />
        {children}
      </div>
    </div>
  );
}

const WPS: { v: Settings["wp"]; a: string; b: string }[] = [
  { v: "bruma", a: "#BFDCDE", b: "#123840" },
  { v: "arena", a: "#E6CFAC", b: "#3D2C14" },
  { v: "musgo", a: "#C2D9BB", b: "#163220" },
  { v: "oxido", a: "#E6C4B2", b: "#3E2017" },
  { v: "tinta", a: "#DFE1E3", b: "#1A1D20" },
];

export function SettingsSheet({ open, onClose, doc, onOrganise, onToast }: {
  open: boolean; onClose: () => void; doc: Doc; onOrganise: () => void; onToast: (m: string) => void;
}) {
  const [json, setJson] = useState("");
  const [prog, setProg] = useState<Progress | null>(null);
  const [busy, setBusy] = useState(false);
  const s = doc.settings;

  return (
    <Shell open={open} onClose={onClose} label="Ajustes">
      <h2>Ajustes</h2>
      <p className="sub">Todo vive en este dispositivo. Nada se envía a ningún servidor.</p>

      <div className="grp">
        <h3>Disposición</h3>
        <div className="line">
          <span className="k">Vista<small>Cuadrícula de iconos o lista por nombre</small></span>
          <Seg value={s.view} onPick={(v) => setSetting("view", v)}
               options={[{ v: "grid" as const, label: "Cuadrícula" }, { v: "list" as const, label: "Lista" }]} />
        </div>
        <div className="line">
          <span className="k">Columnas</span>
          <Seg value={s.cols} onPick={(v) => setSetting("cols", v)}
               options={[{ v: 3 as const, label: "3" }, { v: 4 as const, label: "4" }, { v: 5 as const, label: "5" }, { v: 6 as const, label: "6" }]} />
        </div>
        <div className="line">
          <span className="k">Tamaño</span>
          <Seg value={s.scale} onPick={(v) => setSetting("scale", v)}
               options={[{ v: 0.85, label: "S" }, { v: 1, label: "M" }, { v: 1.15, label: "L" }]} />
        </div>
        <div className="line">
          <span className="k">Etiquetas<small>Nombre bajo cada icono</small></span>
          <Seg value={s.labels} onPick={(v) => setSetting("labels", v)}
               options={[{ v: "off" as const, label: "No" }, { v: "on" as const, label: "Sí" }]} />
        </div>
      </div>

      <div className="grp">
        <h3>Apariencia</h3>
        <div className="line">
          <span className="k">Forma del icono</span>
          <Seg value={s.shape} onPick={(v) => setSetting("shape", v)}
               options={[{ v: "squircle" as const, label: "Squircle" }, { v: "circulo" as const, label: "Círculo" }, { v: "suave" as const, label: "Suave" }, { v: "recto" as const, label: "Recto" }]} />
        </div>
        <div className="line">
          <span className="k">Tema</span>
          <Seg value={s.theme} onPick={(v) => setSetting("theme", v)}
               options={[{ v: "system" as const, label: "Sistema" }, { v: "light" as const, label: "Claro" }, { v: "dark" as const, label: "Oscuro" }]} />
        </div>
        <div className="line">
          <span className="k">Refracción<small>El borde de cristal dobla el fondo. Sólo en navegadores Chromium.</small></span>
          <Seg value={s.refract} onPick={(v) => setSetting("refract", v)}
               options={[{ v: "on" as const, label: "Sí" }, { v: "off" as const, label: "No" }]} />
        </div>
        <div style={{ paddingTop: 12 }}>
          <div className="wps">
            {WPS.map((w) => (
              <button key={w.v} className="wp" aria-pressed={s.wp === w.v} aria-label={`Fondo ${w.v}`}
                      onClick={() => setSetting("wp", w.v)}>
                <span style={{ background: `linear-gradient(150deg, ${w.a}, ${w.b})` }} />
              </button>
            ))}
          </div>
        </div>
      </div>

      <div className="grp">
        <h3>Iconos</h3>
        <p className="hint" style={{ margin: "0 0 12px" }}>
          Cada sitio publica su propio icono. Estante lo lee de su manifiesto, o de
          las etiquetas antiguas si no tiene, y lo guarda aquí para que siga estando
          sin conexión.
        </p>
        <div className="btns">
          <button className="btn ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await hydrateIcons(doc, setProg);
            setBusy(false);
            onToast(r.total === 0 ? "Ya están todos" : `${r.ok} de ${r.total} resueltos`);
          }}>
            <Icon name="down" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 7 }} />
            Traer los que falten
          </button>
          <button className="btn ghost" disabled={busy} onClick={async () => {
            setBusy(true);
            const r = await hydrateIcons(doc, setProg, { force: true });
            setBusy(false);
            onToast(`${r.ok} de ${r.total} resueltos`);
          }}>
            Volver a buscar todos
          </button>
        </div>
        {prog && prog.total > 0 && (
          <>
            <div className="bar"><i style={{ width: `${Math.round((prog.done / prog.total) * 100)}%` }} /></div>
            <p className="hint">{prog.done} de {prog.total}, {prog.ok} con icono propio</p>
          </>
        )}
      </div>

      <div className="grp">
        <h3>Organizar</h3>
        <div className="btns">
          <button className="btn ghost" onClick={() => { onOrganise(); onClose(); }}>
            <Icon name="move" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 7 }} />
            Reordenar iconos
          </button>
          <button className="btn ghost" onClick={() => {
            update((d) => { d.pages.push({ id: uid(), name: `Página ${d.pages.length + 1}`, items: [] }); });
            onToast("Página añadida");
          }}>
            <Icon name="plus" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 7 }} />
            Añadir página
          </button>
        </div>
      </div>

      <div className="grp">
        <h3>Tus datos</h3>
        <div className="btns" style={{ marginBottom: 12 }}>
          <button className="btn ghost" onClick={() => {
            const text = exportJson();
            setJson(text);
            navigator.clipboard?.writeText(text).then(
              () => onToast("Respaldo copiado"),
              () => onToast("Respaldo listo abajo"),
            );
          }}>
            <Icon name="down" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 7 }} />
            Exportar
          </button>
          <button className="btn ghost" onClick={() => {
            onToast(importJson(json) ? "Respaldo importado" : "Ese respaldo no se pudo leer");
          }}>
            <Icon name="up" style={{ width: 16, height: 16, verticalAlign: -3, marginRight: 7 }} />
            Importar
          </button>
          <button className="btn danger" onClick={() => { resetDoc(); onToast("Estante restablecido"); }}>
            Restablecer
          </button>
        </div>
        <textarea className="field" value={json} onChange={(e) => setJson(e.target.value)}
                  spellCheck={false} placeholder="El respaldo aparece aquí. Pega uno y pulsa Importar." />
        <p className="hint">Guarda este texto en un archivo. Lleva todo salvo las imágenes de los iconos, que se vuelven a pedir solas al importar.</p>
      </div>
    </Shell>
  );
}

function normUrl(raw: string) {
  const v = raw.trim();
  if (!v) return "";
  const withScheme = /^https?:\/\//i.test(v) ? v : `https://${v}`;
  try {
    new URL(withScheme);
    return withScheme;
  } catch {
    return "";
  }
}

export function AddSheet({ open, onClose, doc, page, onToast }: {
  open: boolean; onClose: () => void; doc: Doc; page: number; onToast: (m: string) => void;
}) {
  const [url, setUrl] = useState("");
  const [picked, setPicked] = useState<number[]>([]);
  const [dest, setDest] = useState(page);
  const [peek, setPeek] = useState<Resolved | null>(null);
  const [looking, setLooking] = useState(false);
  const trip = useRef(0);

  // Resolve as they type, but only once they have stopped.
  useEffect(() => {
    const candidate = normUrl(url);
    if (!candidate) { setPeek(null); setLooking(false); return; }
    const mine = ++trip.current;
    setLooking(true);
    const timer = setTimeout(async () => {
      const r = await fetchIcon(candidate);
      if (trip.current !== mine) return;
      setPeek(r);
      setLooking(false);
    }, 650);
    return () => clearTimeout(timer);
  }, [url]);

  const commit = () => {
    const target = doc.pages[dest] ? dest : 0;
    let added = 0;
    const made: AppItem[] = [];
    const u = normUrl(url);
    if (u) {
      const h = hostOf(u);
      const fallbackName = h.split(".")[0].replace(/^./, (c) => c.toUpperCase());
      const colour = peek?.ok && /^#[0-9a-f]{6}$/i.test(peek.themeColor ?? "")
        ? (peek.themeColor as string)
        : SWATCHES[Math.floor(Math.random() * SWATCHES.length)];
      const fresh = app(peek?.ok ? peek.name || fallbackName : fallbackName, u, "globe", colour);
      if (peek?.ok) { fresh.icon = peek.icon; fresh.iconSource = peek.source; fresh.iconTried = true; }
      made.push(fresh);
      added++;
    }
    for (const i of picked) {
      const e = CATALOG[i];
      made.push(app(e.name, e.url, e.g, e.c));
      added++;
    }
    if (!added) { onToast("Elige algo primero"); return; }
    update((d) => { d.pages[target].items.push(...made); });
    setUrl(""); setPicked([]);
    onToast(`${added} ${added === 1 ? "app añadida" : "apps añadidas"} a ${doc.pages[target].name}`);
    onClose();
  };

  return (
    <Shell open={open} onClose={onClose} label="Añadir app">
      <h2>Añadir al estante</h2>
      <p className="sub">Pega una dirección o elige del catálogo.</p>

      <div className="grp">
        <h3>Dirección</h3>
        <input className="field" value={url} onChange={(e) => setUrl(e.target.value)}
               placeholder="figma.com" inputMode="url" aria-label="Dirección" autoComplete="off" />
        {looking && <p className="hint">Leyendo el sitio…</p>}
        {!looking && peek?.ok && (
          <div className="iconrow">
            <Ico item={{ id: "peek", type: "app", name: peek.name, url: normUrl(url),
                         g: "globe", c: peek.themeColor ?? "#0E7C74",
                         icon: peek.icon, iconSource: peek.source }} />
            <div className="m">
              <b>{peek.name}</b>
              <span>{peek.host} · icono desde {peek.source}</span>
            </div>
          </div>
        )}
        {!looking && peek && !peek.ok && (
          <p className="hint">Ese sitio no publica un icono utilizable. Se añadirá con un glifo.</p>
        )}
      </div>

      <div className="grp">
        <h3>Catálogo</h3>
        <div className="cat">
          {CATALOG.map((e, i) => {
            const on = picked.includes(i);
            return (
              <button key={e.url} className="catit" type="button" aria-pressed={on}
                      onClick={() => setPicked((p) => (on ? p.filter((x) => x !== i) : [...p, i]))}>
                <span className="ico" style={{ ["--c" as string]: e.c } as React.CSSProperties}>
                  <Glyph name={e.g} />
                </span>
                <span className="lbl">{e.name}</span>
                <span className="tick"><Glyph name="check" /></span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="grp">
        <h3>Destino</h3>
        <select className="field" value={dest} onChange={(e) => setDest(Number(e.target.value))}>
          {doc.pages.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
        </select>
      </div>

      <div className="btns">
        <button className="btn" onClick={commit}>Añadir</button>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
      </div>
    </Shell>
  );
}

export function EditSheet({ open, onClose, doc, item, onToast, onRemove }: {
  open: boolean; onClose: () => void; doc: Doc; item: Item | null;
  onToast: (m: string) => void; onRemove: (id: string) => void;
}) {
  const [draft, setDraft] = useState<{ id: string; name: string; url: string; c: string; page: number } | null>(null);

  const home = useMemo(() => {
    if (!item) return 0;
    const i = doc.pages.findIndex((p) => p.items.some((x) => x.id === item.id));
    return i < 0 ? 0 : i;
  }, [doc, item]);

  if (item && (!draft || draft.id !== item.id)) {
    setDraft({
      id: item.id,
      name: item.name,
      url: isFolder(item) ? "" : item.url,
      c: isFolder(item) ? "" : item.c,
      page: home,
    });
  }
  if (!item || !draft) return <Shell open={false} onClose={onClose} label="Editar"><div /></Shell>;

  const folder = isFolder(item);

  const save = () => {
    update((d) => {
      for (const p of d.pages) {
        const hit = p.items.find((x) => x.id === draft.id);
        if (hit) {
          hit.name = draft.name.trim() || hit.name;
          if (hit.type === "app") {
            hit.url = normUrl(draft.url) || hit.url;
            hit.c = draft.c;
          }
          const to = d.pages[draft.page];
          if (to && to !== p) {
            p.items.splice(p.items.indexOf(hit), 1);
            to.items.push(hit);
          }
          return;
        }
        for (const f of p.items) {
          if (f.type !== "folder") continue;
          const inner = f.items.find((x) => x.id === draft.id);
          if (inner) {
            inner.name = draft.name.trim() || inner.name;
            inner.url = normUrl(draft.url) || inner.url;
            inner.c = draft.c;
            return;
          }
        }
      }
      const d0 = d.dock.find((x) => x.id === draft.id);
      if (d0) {
        d0.name = draft.name.trim() || d0.name;
        d0.url = normUrl(draft.url) || d0.url;
        d0.c = draft.c;
      }
    });
    onToast("Guardado");
    onClose();
  };

  return (
    <Shell open={open} onClose={onClose} label="Editar app">
      <h2>{folder ? "Carpeta" : "Editar"}</h2>
      <p className="sub">{folder ? `${item.items.length} apps dentro` : hostOf(item.url)}</p>

      <div className="grp">
        <h3>Nombre</h3>
        <input className="field" value={draft.name}
               onChange={(e) => setDraft({ ...draft, name: e.target.value })} aria-label="Nombre" />
      </div>

      {!folder && (
        <>
          <div className="grp">
            <h3>Dirección</h3>
            <input className="field" value={draft.url} inputMode="url"
                   onChange={(e) => setDraft({ ...draft, url: e.target.value })} aria-label="Dirección" />
          </div>
          <div className="grp">
            <h3>Color</h3>
            <div className="sw">
              {SWATCHES.map((c) => (
                <button key={c} aria-pressed={c.toLowerCase() === draft.c.toLowerCase()}
                        aria-label={`Color ${c}`} style={{ background: c }}
                        onClick={() => setDraft({ ...draft, c })} />
              ))}
            </div>
          </div>
        </>
      )}

      <div className="grp">
        <h3>Página</h3>
        <select className="field" value={draft.page}
                onChange={(e) => setDraft({ ...draft, page: Number(e.target.value) })}>
          {doc.pages.map((p, i) => <option key={p.id} value={i}>{p.name}</option>)}
        </select>
      </div>

      <div className="btns">
        <button className="btn" onClick={save}>Guardar</button>
        <button className="btn ghost" onClick={onClose}>Cancelar</button>
        <button className="btn danger" onClick={() => { onRemove(item.id); onClose(); }}>Quitar</button>
      </div>
    </Shell>
  );
}

export function Ghost({ item }: { item: Item }) {
  return <Ico item={item} />;
}
