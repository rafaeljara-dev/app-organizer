"use client";

import type { CSSProperties } from "react";
import { Glyph } from "@/lib/glyphs";
import { isFolder, type AppItem, type Item } from "@/lib/types";

const cssVar = (name: string, value: string) => ({ [name]: value }) as CSSProperties;

export function Ico({ item, className = "" }: { item: Item; className?: string }) {
  if (isFolder(item)) {
    return (
      <span className={`ico folder ${className}`}>
        {item.items.slice(0, 4).map((k) => (
          <i key={k.id} style={cssVar("--mc", `color-mix(in oklab, ${k.c} var(--gmix), var(--mix))`)} />
        ))}
      </span>
    );
  }
  return (
    <span className={`ico ${className}`} style={cssVar("--c", item.c)}>
      <Glyph name={item.g} />
    </span>
  );
}

export function hostOf(url: string) {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
}

export function Row({ item, onOpen }: { item: AppItem; onOpen: () => void }) {
  return (
    <a className="row" href={item.url} target="_blank" rel="noopener noreferrer"
       onClick={(e) => { e.preventDefault(); onOpen(); }}>
      <Ico item={item} />
      <span className="nm">{item.name}</span>
      <span className="hs">{hostOf(item.url)}</span>
    </a>
  );
}
