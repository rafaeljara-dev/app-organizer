"use client";

import { useState } from "react";
import { isFolder, type AppItem, type Item } from "@/lib/types";

function SiteImage({ item }: { item: AppItem }) {
  const [failed, setFailed] = useState<string | undefined>();
  return item.icon && failed !== item.icon ? (
    <img src={item.icon} alt="" loading="lazy" decoding="async" draggable={false}
         onError={() => setFailed(item.icon)} />
  ) : <span className="icon-placeholder" aria-label="Sin icono del sitio">{item.name[0]?.toUpperCase() || "?"}</span>;
}

/** Display the site's original image, including ICO files, without redrawing it. */
export function Ico({ item, className = "" }: { item: Item; className?: string }) {
  if (isFolder(item)) {
    return <span className={`ico folder ${className}`}>
      {item.items.slice(0, 4).map((child) => <i key={child.id} className="folder-cell"><SiteImage item={child} /></i>)}
    </span>;
  }
  return <span className={`ico ico--inset ${className}`}><SiteImage item={item} /></span>;
}

export function hostOf(url: string) {
  try { return new URL(url).hostname.replace(/^www\./, ""); } catch { return url; }
}

export function Row({ item, onOpen }: { item: AppItem; onOpen?: () => void }) {
  return <a className="row" href={item.url} target="_blank" rel="noopener noreferrer" onClick={onOpen}>
    <Ico item={item} /><span className="nm">{item.name}</span><span className="hs">{hostOf(item.url)}</span>
  </a>;
}
