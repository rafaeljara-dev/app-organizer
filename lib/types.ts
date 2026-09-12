export type GlyphName =
  | "mail" | "chat" | "spark" | "pin" | "cal" | "cloud" | "img" | "doc"
  | "play" | "globe" | "pen" | "tv" | "grid" | "list" | "code" | "music"
  | "film" | "cart" | "bag" | "card" | "check" | "folder";

export type AppItem = {
  id: string;
  type: "app";
  name: string;
  url: string;
  g: GlyphName;
  c: string;
};

export type Folder = {
  id: string;
  type: "folder";
  name: string;
  items: AppItem[];
};

export type Item = AppItem | Folder;

export type Page = { id: string; name: string; items: Item[] };

export type Settings = {
  view: "grid" | "list";
  cols: 3 | 4 | 5 | 6;
  scale: number;
  shape: "squircle" | "circulo" | "suave" | "recto";
  labels: "on" | "off";
  wp: "bruma" | "arena" | "musgo" | "oxido" | "tinta";
  theme: "system" | "light" | "dark";
  refract: "on" | "off";
};

export type Doc = {
  schemaVersion: 1;
  settings: Settings;
  dock: AppItem[];
  pages: Page[];
};

export const isFolder = (i: Item): i is Folder => i.type === "folder";
