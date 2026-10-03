"use client";

import { useCallback, useEffect, useRef } from "react";
import { Icon } from "@/lib/glyphs";
import { isFolder, type AppItem, type Folder, type Item } from "@/lib/types";
import { Ico, hostOf } from "./Tile";

const HOLD_MS = 500;
const MOVE_PX = 10;

export type ShortcutDragPayload = {
  itemId: string;
  listId: string;
  pointerId: number;
  pointerType: string;
  clientX: number;
  clientY: number;
};

export type ShortcutDragMovePayload = ShortcutDragPayload;

export type ShortcutDragEndPayload = ShortcutDragPayload & {
  cancelled?: boolean;
};

export type ShortcutMenuPosition = {
  x: number;
  y: number;
};

type Variant = "tile" | "row";

export type ShortcutProps = {
  item: Item;
  listId?: string;
  variant?: Variant;
  edit?: boolean;
  dragging?: boolean;
  dragOver?: boolean;
  onOpenFolder: (folder: Folder) => void;
  onMenu: (item: Item, position: ShortcutMenuPosition, restore: HTMLElement | null) => void;
  onDragStart?: (payload: ShortcutDragPayload) => void;
  onDragMove?: (payload: ShortcutDragMovePayload) => void;
  onDragEnd?: (payload: ShortcutDragEndPayload) => void;
  onDragCancel?: (payload: ShortcutDragEndPayload) => void;
};

type PointerSession = {
  pointerId: number;
  pointerType: string;
  startX: number;
  startY: number;
  lastX: number;
  lastY: number;
  held: boolean;
  moved: boolean;
  cancelled: boolean;
  dragging: boolean;
};

/**
 * One stable interactive shortcut. Touch and pen use a short hold for the
 * actions menu, while edit mode promotes a moved pointer to a React drag.
 * The component deliberately leaves app links as ordinary anchors so the
 * operating system's default browser handles them.
 */
export function Shortcut({
  item,
  listId,
  variant = "tile",
  edit = false,
  dragging = false,
  dragOver = false,
  onOpenFolder,
  onMenu,
  onDragStart,
  onDragMove,
  onDragEnd,
  onDragCancel,
}: ShortcutProps) {
  const rootRef = useRef<HTMLDivElement>(null);
  const holdTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pointerRef = useRef<PointerSession | null>(null);
  const suppressClickRef = useRef(false);

  const clearHold = useCallback(() => {
    if (holdTimerRef.current !== null) {
      clearTimeout(holdTimerRef.current);
      holdTimerRef.current = null;
    }
  }, []);

  const payload = useCallback((session: PointerSession): ShortcutDragPayload => ({
    itemId: item.id,
    listId: listId ?? "",
    pointerId: session.pointerId,
    pointerType: session.pointerType,
    clientX: session.lastX,
    clientY: session.lastY,
  }), [item.id, listId]);

  const openMenuAt = useCallback((x: number, y: number, restore: HTMLElement | null, suppressClick = true) => {
    suppressClickRef.current = suppressClick;
    onMenu(item, { x, y }, restore);
  }, [item, onMenu]);

  const focusTarget = useCallback(() => (
    rootRef.current?.querySelector<HTMLElement>(".tile, .row") ?? rootRef.current
  ), []);

  useEffect(() => {
    // A browser usually emits pointercancel while scrolling. The capture
    // listener covers browsers that only emit a scroll event for that gesture.
    const cancelHoldOnScroll = () => {
      const session = pointerRef.current;
      if (!session) return;
      clearHold();
      if (!session.dragging) {
        session.cancelled = true;
        session.moved = true;
        suppressClickRef.current = true;
      }
    };
    window.addEventListener("scroll", cancelHoldOnScroll, true);
    return () => {
      window.removeEventListener("scroll", cancelHoldOnScroll, true);
      clearHold();
    };
  }, [clearHold]);

  useEffect(() => () => {
    clearHold();
    pointerRef.current = null;
  }, [clearHold]);

  const onPointerDown = (event: React.PointerEvent<HTMLDivElement>) => {
    const target = event.target as HTMLElement;
    if (target.closest(".kill, .shortcut-options")) return;
    if (event.pointerType === "mouse" && event.button !== 0) return;
    clearHold();

    const session: PointerSession = {
      pointerId: event.pointerId,
      pointerType: event.pointerType,
      startX: event.clientX,
      startY: event.clientY,
      lastX: event.clientX,
      lastY: event.clientY,
      held: false,
      moved: false,
      cancelled: false,
      dragging: false,
    };
    pointerRef.current = session;
    suppressClickRef.current = false;

    if (edit && listId) {
      try { event.currentTarget.setPointerCapture(event.pointerId); }
      catch { /* Synthetic pointers and older browsers may not support capture. */ }
    }

    if (event.pointerType === "touch" || event.pointerType === "pen") {
      holdTimerRef.current = setTimeout(() => {
        const current = pointerRef.current;
        if (!current || current.pointerId !== session.pointerId || current.moved || current.cancelled || current.dragging) return;
        current.held = true;
        openMenuAt(current.lastX, current.lastY, focusTarget());
      }, HOLD_MS);
    }
  };

  const onPointerMove = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.lastX = event.clientX;
    session.lastY = event.clientY;

    const distance = Math.max(
      Math.abs(event.clientX - session.startX),
      Math.abs(event.clientY - session.startY),
    );
    if (!session.moved && distance > MOVE_PX) {
      session.moved = true;
      clearHold();
      if (edit && listId && onDragStart && !session.cancelled) {
        session.dragging = true;
        suppressClickRef.current = true;
        try {
          // Capture only after a real drag starts. Capturing on pointerdown
          // retargets a normal tap's click away from the underlying anchor.
          event.currentTarget.setPointerCapture(event.pointerId);
        } catch {
          // Pointer capture is optional on older embedded webviews.
        }
        onDragStart(payload(session));
      } else {
        session.cancelled = true;
        suppressClickRef.current = true;
      }
    }

    if (session.dragging && onDragMove) {
      event.preventDefault();
      onDragMove(payload(session));
    }
  };

  const finishPointer = (event: React.PointerEvent<HTMLDivElement>, cancelled: boolean) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId) return;
    session.lastX = event.clientX;
    session.lastY = event.clientY;
    clearHold();

    if (cancelled) session.cancelled = true;
    if (session.dragging) {
      const end = { ...payload(session), cancelled: session.cancelled };
      suppressClickRef.current = true;
      if (session.cancelled) onDragCancel?.(end);
      else onDragEnd?.(end);
    } else if (session.held || session.moved || session.cancelled) {
      suppressClickRef.current = true;
    }

    pointerRef.current = null;
    try {
      event.currentTarget.releasePointerCapture(event.pointerId);
    } catch {
      // The pointer may already have been released by the browser.
    }
  };

  const onLostPointerCapture = (event: React.PointerEvent<HTMLDivElement>) => {
    const session = pointerRef.current;
    if (!session || session.pointerId !== event.pointerId || !session.dragging) return;
    clearHold();
    session.cancelled = true;
    suppressClickRef.current = true;
    onDragCancel?.({ ...payload(session), cancelled: true });
    pointerRef.current = null;
  };

  const onClick = (event: React.MouseEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (suppressClickRef.current) {
      event.preventDefault();
      event.stopPropagation();
      suppressClickRef.current = false;
      return;
    }
    if (edit) {
      event.preventDefault();
      return;
    }
    if (isFolder(item)) onOpenFolder(item);
  };

  const onContextMenu = (event: React.MouseEvent<HTMLDivElement>) => {
    event.preventDefault();
    clearHold();
    openMenuAt(event.clientX, event.clientY, focusTarget());
  };

  const onKeyDown = (event: React.KeyboardEvent<HTMLAnchorElement | HTMLButtonElement>) => {
    if (event.key === "ContextMenu" || (event.key === "F10" && event.shiftKey)) {
      event.preventDefault();
      const rect = event.currentTarget.getBoundingClientRect();
      openMenuAt(rect.left + rect.width / 2, rect.top + rect.height / 2, event.currentTarget, false);
    }
  };

  const rootClass = variant === "tile" ? "cell" : "shortcut-row";
  const rootStyle = { touchAction: edit && listId ? "none" : "pan-y" };
  const common = {
    "aria-label": item.name,
    onClick,
    onKeyDown,
  };

  return (
    <div
      ref={rootRef}
      className={rootClass}
      data-id={item.id}
      data-shortcut-id={item.id}
      data-list-id={listId}
      data-dragging={dragging || undefined}
      data-drag-over={dragOver || undefined}
      data-drop-list={listId}
      style={rootStyle}
      onPointerDown={onPointerDown}
      onPointerMove={onPointerMove}
      onPointerUp={(event) => finishPointer(event, false)}
      onPointerCancel={(event) => finishPointer(event, true)}
      onPointerLeave={() => {
        const session = pointerRef.current;
        if (!session || session.dragging || session.held) return;
        clearHold();
        session.cancelled = true;
        suppressClickRef.current = true;
      }}
      onLostPointerCapture={onLostPointerCapture}
      onContextMenu={onContextMenu}
    >
      {isFolder(item) ? (
        <button type="button" className={variant === "tile" ? "tile" : "row"} {...common}>
          <Ico item={item} />
          {variant === "tile" ? <span className="lbl">{item.name}</span> : <>
            <span className="nm">{item.name}</span>
            <span className="hs">{item.items.length} sitios</span>
          </>}
        </button>
      ) : (
        <a
          className={variant === "tile" ? "tile" : "row"}
          href={item.url}
          target="_blank"
          rel="noopener noreferrer"
          draggable={false}
          {...common}
        >
          <Ico item={item} />
          {variant === "tile" ? <span className="lbl">{item.name}</span> : <>
            <span className="nm">{item.name}</span>
            <span className="hs">{hostOf(item.url)}</span>
          </>}
        </a>
      )}

      <button
        type="button"
        className="shortcut-options"
        aria-label={`Opciones de ${item.name}`}
        onPointerDown={(event) => event.stopPropagation()}
        onClick={(event) => {
          event.stopPropagation();
          const rect = event.currentTarget.getBoundingClientRect();
          openMenuAt(rect.left + rect.width / 2, rect.bottom, event.currentTarget, false);
        }}
      >
        <Icon name="menu" />
      </button>

    </div>
  );
}

export default Shortcut;
