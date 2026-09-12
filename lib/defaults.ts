import type { AppItem, Doc, Folder, GlyphName } from "./types";

export const uid = () =>
  typeof crypto !== "undefined" && "randomUUID" in crypto
    ? crypto.randomUUID().slice(0, 8)
    : Math.random().toString(36).slice(2, 10);

export const app = (name: string, url: string, g: GlyphName, c: string): AppItem => ({
  id: uid(), type: "app", name, url, g, c,
});

const folder = (name: string, items: AppItem[]): Folder => ({
  id: uid(), type: "folder", name, items,
});

export function defaultDoc(): Doc {
  return {
    schemaVersion: 1,
    settings: {
      view: "grid", cols: 4, scale: 1, shape: "squircle",
      labels: "off", wp: "bruma", theme: "system", refract: "on",
    },
    dock: [
      app("Gmail", "https://mail.google.com", "mail", "#D14836"),
      app("WhatsApp", "https://web.whatsapp.com", "chat", "#1FA855"),
      app("Claude", "https://claude.ai", "spark", "#C96442"),
      app("Maps", "https://maps.google.com", "pin", "#1A9E5F"),
    ],
    pages: [
      {
        id: uid(), name: "Diario",
        items: [
          app("Calendario", "https://calendar.google.com", "cal", "#2F6FD0"),
          app("Drive", "https://drive.google.com", "cloud", "#3D8BFD"),
          app("Fotos", "https://photos.google.com", "img", "#E4572E"),
          app("Keep", "https://keep.google.com", "doc", "#D9A116"),
          app("YouTube", "https://youtube.com", "play", "#C4302B"),
          app("Traductor", "https://translate.google.com", "globe", "#1F7AE0"),
          app("Meet", "https://meet.google.com", "tv", "#00897B"),
          app("Sheets", "https://sheets.google.com", "grid", "#1E8E3E"),
          folder("Trabajo", [
            app("Notion", "https://notion.so", "doc", "#6B6B6B"),
            app("Slack", "https://app.slack.com", "chat", "#7C3E7E"),
            app("Linear", "https://linear.app", "list", "#5E6AD2"),
            app("Trello", "https://trello.com", "grid", "#0079BF"),
          ]),
        ],
      },
      {
        id: uid(), name: "Crear",
        items: [
          app("Figma", "https://figma.com", "pen", "#A259FF"),
          app("Canva", "https://canva.com", "img", "#00C4CC"),
          app("GitHub", "https://github.com", "code", "#3A3F45"),
          app("Excalidraw", "https://excalidraw.com", "pen", "#6965DB"),
          app("tldraw", "https://tldraw.com", "pen", "#2F80ED"),
          app("Photopea", "https://photopea.com", "img", "#3B7DD8"),
        ],
      },
      {
        id: uid(), name: "Ocio",
        items: [
          app("Netflix", "https://netflix.com", "film", "#E50914"),
          app("Spotify", "https://open.spotify.com", "music", "#1DB954"),
          app("Twitch", "https://twitch.tv", "tv", "#9146FF"),
          app("Letterboxd", "https://letterboxd.com", "film", "#00AC1C"),
          app("Amazon", "https://amazon.com", "cart", "#E08A00"),
          app("PayPal", "https://paypal.com", "card", "#003087"),
        ],
      },
    ],
  };
}
