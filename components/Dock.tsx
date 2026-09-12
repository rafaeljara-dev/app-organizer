"use client";

import { useEffect, useLayoutEffect, useRef } from "react";
import { Icon } from "@/lib/glyphs";
import type { AppItem } from "@/lib/types";
import { Ico, Row } from "./Tile";

type Props = {
  dock: AppItem[];
  searching: boolean;
  query: string;
  results: AppItem[];
  onToggleSearch: () => void;
  onQuery: (v: string) => void;
  onOpen: (item: AppItem) => void;
  onContext: (item: AppItem, x: number, y: number) => void;
};

export default function Dock({
  dock, searching, query, results, onToggleSearch, onQuery, onOpen, onContext,
}: Props) {
  const barRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // The two halves swap width, so both need the same explicit pixel target.
  // A percentage would collapse to zero inside the closed half.
  useLayoutEffect(() => {
    const bar = barRef.current;
    if (!bar) return;
    const measure = () => {
      const inner = Math.max(0, bar.clientWidth - 26 - 60);
      bar.style.setProperty("--dock-inner", `${inner}px`);
    };
    measure();
    const ro = new ResizeObserver(measure);
    ro.observe(bar);
    return () => ro.disconnect();
  }, []);

  useEffect(() => {
    if (searching) inputRef.current?.focus();
  }, [searching]);

  const open = searching ? "var(--dock-inner)" : "0px";
  const shut = searching ? "0px" : "var(--dock-inner)";

  return (
    <div className="dockbar">
      <div className="results glass glass-solid" data-open={searching && results.length > 0}>
        <div className="glass-refract" />
        <div className="glass-body">
          <p className="cap">{query ? "Resultados" : "Sugerencias"}</p>
          {results.map((it) => (
            <Row key={it.id} item={it} onOpen={() => onOpen(it)} />
          ))}
        </div>
      </div>

      <div className="dock glass" ref={barRef}>
        <div className="glass-refract" />
        <div className="dockwrap glass-body" style={{ width: shut }}>
          <div className="dockrow" style={{ width: "var(--dock-inner)", opacity: searching ? 0 : 1 }}>
            {dock.map((it) => (
              <div className="cell" key={it.id}>
                <a className="tile" href={it.url} target="_blank" rel="noopener noreferrer"
                   aria-label={it.name}
                   onClick={(e) => { e.preventDefault(); onOpen(it); }}
                   onContextMenu={(e) => { e.preventDefault(); onContext(it, e.clientX, e.clientY); }}>
                  <Ico item={it} />
                </a>
              </div>
            ))}
          </div>
        </div>

        <div className="searchwrap glass-body" style={{ width: open }}>
          <div className="searchbox" style={{ width: "var(--dock-inner)", opacity: searching ? 1 : 0 }}>
            <Icon name="search" style={{ width: 19, height: 19, color: "var(--ink-3)", flex: "0 0 auto" }} />
            <input ref={inputRef} value={query} onChange={(e) => onQuery(e.target.value)}
                   placeholder="Buscar o abrir" inputMode="search" aria-label="Buscar"
                   onKeyDown={(e) => {
                     if (e.key === "Enter" && results[0]) onOpen(results[0]);
                     if (e.key === "Escape") onToggleSearch();
                   }} />
          </div>
        </div>

        <button className="searchbtn glass-body" onClick={onToggleSearch}
                aria-label={searching ? "Cerrar búsqueda" : "Buscar"} aria-expanded={searching}
                style={{
                  background: searching ? "var(--ink)" : "color-mix(in oklab, var(--accent) var(--wash), var(--mix))",
                  color: searching ? "var(--mix)" : "color-mix(in oklab, var(--accent) var(--gmix), var(--ink))",
                }}>
          <span className="ic" style={{ opacity: searching ? 0 : 1, transform: searching ? "rotate(-90deg) scale(.7)" : "none" }}>
            <Icon name="search" />
          </span>
          <span className="ic" style={{ opacity: searching ? 1 : 0, transform: searching ? "none" : "rotate(90deg) scale(.7)" }}>
            <Icon name="x" />
          </span>
        </button>
      </div>
    </div>
  );
}
