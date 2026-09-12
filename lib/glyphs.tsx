import type { CSSProperties, ReactNode } from "react";
import type { GlyphName } from "./types";

const P = (d: string) => <path key={d} d={d} />;

const SHAPES: Record<GlyphName, ReactNode> = {
  mail: <>
    <rect x="3" y="5" width="18" height="14" rx="3" />
    {P("m3.9 7.6 7 5a2 2 0 0 0 2.2 0l7-5")}
  </>,
  chat: P("M20 12.2c0 3.7-3.6 6.7-8 6.7a9.6 9.6 0 0 1-2.6-.35L5 20l1.1-3.2A6.3 6.3 0 0 1 4 12.2C4 8.5 7.6 5.5 12 5.5s8 3 8 6.7z"),
  spark: P("M12 3.4c.6 4.3 2.9 6.6 7.2 7.2-4.3.6-6.6 2.9-7.2 7.2-.6-4.3-2.9-6.6-7.2-7.2 4.3-.6 6.6-2.9 7.2-7.2z"),
  pin: <>
    {P("M12 21s6.5-6 6.5-10.5a6.5 6.5 0 1 0-13 0C5.5 15 12 21 12 21z")}
    <circle cx="12" cy="10.5" r="2.4" />
  </>,
  cal: <>
    <rect x="3.5" y="5" width="17" height="15" rx="3" />
    {P("M3.5 10h17M8 3.4v3.2M16 3.4v3.2")}
  </>,
  cloud: P("M7.5 19a4.5 4.5 0 0 1-.4-9 6 6 0 0 1 11.5 1.6A3.9 3.9 0 0 1 17.5 19z"),
  img: <>
    <rect x="3.5" y="5" width="17" height="14" rx="3" />
    <circle cx="9" cy="10" r="1.6" />
    {P("m4.6 17.8 4.1-4.1a2 2 0 0 1 2.8 0l4.9 4.9")}
  </>,
  doc: <>
    {P("M6.5 3.5h7L19 9v10.5a1.6 1.6 0 0 1-1.6 1.5H6.6A1.6 1.6 0 0 1 5 19.5v-14a1.6 1.6 0 0 1 1.5-2z")}
    {P("M13.4 3.6V9H19M8.6 13.6h6.8M8.6 17h4.8")}
  </>,
  play: <>
    <rect x="3" y="5" width="18" height="14" rx="4.5" />
    {P("M10 8.9 15.6 12 10 15.1z")}
  </>,
  globe: <>
    <circle cx="12" cy="12" r="8.5" />
    {P("M3.6 12h16.8M12 3.5c2.3 2.4 3.5 5.3 3.5 8.5S14.3 18.1 12 20.5c-2.3-2.4-3.5-5.3-3.5-8.5S9.7 5.9 12 3.5z")}
  </>,
  pen: <>
    {P("m5 19 1.1-4.1L16.6 4.4a2.1 2.1 0 0 1 3 3L9.1 17.9z")}
    {P("m14.6 6.4 3 3")}
  </>,
  tv: <>
    <rect x="3" y="4.5" width="18" height="12.5" rx="3" />
    {P("M8.5 20.5h7")}
  </>,
  grid: <>
    <rect x="4" y="4" width="7" height="7" rx="2.2" />
    <rect x="13" y="4" width="7" height="7" rx="2.2" />
    <rect x="4" y="13" width="7" height="7" rx="2.2" />
    <rect x="13" y="13" width="7" height="7" rx="2.2" />
  </>,
  list: <>
    {P("M9 7h10.5M9 12h10.5M9 17h6.5")}
    {P("M4.6 7h.01M4.6 12h.01M4.6 17h.01")}
  </>,
  code: P("m9 8.4-4.2 3.7L9 15.8M15 8.4l4.2 3.7L15 15.8"),
  music: <>
    {P("M9 17.3V6.9l10-2v10.2")}
    <ellipse cx="6.5" cy="17.6" rx="2.5" ry="2.1" />
    <ellipse cx="16.5" cy="15.4" rx="2.5" ry="2.1" />
  </>,
  film: <>
    <rect x="3" y="4.5" width="18" height="15" rx="3" />
    {P("M8 4.5v15M16 4.5v15M3 12h18")}
  </>,
  cart: <>
    {P("M3 4.5h2.3l2.2 9.6a1.8 1.8 0 0 0 1.8 1.4h7a1.8 1.8 0 0 0 1.8-1.4L20.5 8H6.2")}
    <circle cx="10" cy="19.2" r="1.4" />
    <circle cx="17" cy="19.2" r="1.4" />
  </>,
  bag: <>
    {P("M5.6 7.6h12.8l1 12.4H4.6z")}
    {P("M9 9.6V7a3 3 0 0 1 6 0v2.6")}
  </>,
  card: <>
    <rect x="3" y="5.5" width="18" height="13" rx="3" />
    {P("M3 10h18M6.6 14.6h4")}
  </>,
  check: P("m5 12.6 4.6 4.6L19 7.2"),
  folder: P("M3.5 6.6a1.6 1.6 0 0 1 1.6-1.6h3.8l2 2.5h8a1.6 1.6 0 0 1 1.6 1.6v8.3a1.6 1.6 0 0 1-1.6 1.6H5.1a1.6 1.6 0 0 1-1.6-1.6z"),
};

/** Interface chrome, kept apart from the app glyphs. */
export const UI = {
  plus: P("M12 5v14M5 12h14"),
  gear: <>
    {P("M4 7.5h8.4M17.6 7.5H20M4 16.5h2.4M11.6 16.5H20")}
    <circle cx="15" cy="7.5" r="2.6" />
    <circle cx="9" cy="16.5" r="2.6" />
  </>,
  search: <>
    <circle cx="11" cy="11" r="6.5" />
    {P("m15.9 15.9 4.6 4.6")}
  </>,
  x: P("m6.6 6.6 10.8 10.8M17.4 6.6 6.6 17.4"),
  move: P("M12 3.5v17M3.5 12h17M12 3.5 9.6 6M12 3.5 14.4 6M12 20.5 9.6 18M12 20.5l2.4-2.5M3.5 12 6 9.6M3.5 12 6 14.4M20.5 12 18 9.6M20.5 12 18 14.4"),
  open: <>
    {P("M14 4.6h5.4V10M19.2 5l-8 8")}
    {P("M18 14.6v4a1.6 1.6 0 0 1-1.6 1.5H5.6A1.6 1.6 0 0 1 4 18.5V7.6A1.6 1.6 0 0 1 5.6 6h4")}
  </>,
  edit: P("m5 19 1.1-4.1L16.6 4.4a2.1 2.1 0 0 1 3 3L9.1 17.9z"),
  info: <>
    <circle cx="12" cy="12" r="8.5" />
    {P("M12 11v5.6M12 7.8v.5")}
  </>,
  down: P("M12 4v12M7 11.4l5 5 5-5M4.6 20h14.8"),
  up: P("M12 20V8M7 12.6l5-5 5 5M4.6 4h14.8"),
} as const;

type Common = { className?: string; style?: CSSProperties };

export function Glyph({ name, className, style }: { name: GlyphName } & Common) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.6}
         strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {SHAPES[name]}
    </svg>
  );
}

export function Icon({ name, className, style }: { name: keyof typeof UI } & Common) {
  return (
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth={1.7}
         strokeLinecap="round" strokeLinejoin="round" className={className} style={style} aria-hidden="true">
      {UI[name]}
    </svg>
  );
}
