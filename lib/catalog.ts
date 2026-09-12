import type { GlyphName } from "./types";

/** Seed catalog. Community additions belong here as plain data. */
export type CatalogEntry = { name: string; url: string; g: GlyphName; c: string };

export const CATALOG: CatalogEntry[] = [
  { name: "Gmail", url: "https://mail.google.com", g: "mail", c: "#D14836" },
  { name: "Outlook", url: "https://outlook.live.com", g: "mail", c: "#0F6CBD" },
  { name: "WhatsApp", url: "https://web.whatsapp.com", g: "chat", c: "#1FA855" },
  { name: "Telegram", url: "https://web.telegram.org", g: "chat", c: "#2AABEE" },
  { name: "Discord", url: "https://discord.com/app", g: "chat", c: "#5865F2" },
  { name: "Slack", url: "https://app.slack.com", g: "chat", c: "#7C3E7E" },
  { name: "Claude", url: "https://claude.ai", g: "spark", c: "#C96442" },
  { name: "Notion", url: "https://notion.so", g: "doc", c: "#6B6B6B" },
  { name: "Figma", url: "https://figma.com", g: "pen", c: "#A259FF" },
  { name: "Canva", url: "https://canva.com", g: "img", c: "#00C4CC" },
  { name: "Linear", url: "https://linear.app", g: "list", c: "#5E6AD2" },
  { name: "Trello", url: "https://trello.com", g: "grid", c: "#0079BF" },
  { name: "GitHub", url: "https://github.com", g: "code", c: "#3A3F45" },
  { name: "Excalidraw", url: "https://excalidraw.com", g: "pen", c: "#6965DB" },
  { name: "tldraw", url: "https://tldraw.com", g: "pen", c: "#2F80ED" },
  { name: "Photopea", url: "https://photopea.com", g: "img", c: "#3B7DD8" },
  { name: "Calendario", url: "https://calendar.google.com", g: "cal", c: "#2F6FD0" },
  { name: "Drive", url: "https://drive.google.com", g: "cloud", c: "#3D8BFD" },
  { name: "Fotos", url: "https://photos.google.com", g: "img", c: "#E4572E" },
  { name: "Keep", url: "https://keep.google.com", g: "doc", c: "#D9A116" },
  { name: "Maps", url: "https://maps.google.com", g: "pin", c: "#1A9E5F" },
  { name: "Traductor", url: "https://translate.google.com", g: "globe", c: "#1F7AE0" },
  { name: "Meet", url: "https://meet.google.com", g: "tv", c: "#00897B" },
  { name: "Sheets", url: "https://sheets.google.com", g: "grid", c: "#1E8E3E" },
  { name: "YouTube", url: "https://youtube.com", g: "play", c: "#C4302B" },
  { name: "Spotify", url: "https://open.spotify.com", g: "music", c: "#1DB954" },
  { name: "Netflix", url: "https://netflix.com", g: "film", c: "#E50914" },
  { name: "Twitch", url: "https://twitch.tv", g: "tv", c: "#9146FF" },
  { name: "Letterboxd", url: "https://letterboxd.com", g: "film", c: "#00AC1C" },
  { name: "Amazon", url: "https://amazon.com", g: "cart", c: "#E08A00" },
  { name: "Mercado Libre", url: "https://mercadolibre.com.mx", g: "bag", c: "#E8B400" },
  { name: "PayPal", url: "https://paypal.com", g: "card", c: "#003087" },
  { name: "Wise", url: "https://wise.com", g: "card", c: "#4E9E2E" },
  { name: "Booking", url: "https://booking.com", g: "bag", c: "#003580" },
  { name: "Duolingo", url: "https://duolingo.com", g: "globe", c: "#58CC02" },
  { name: "MDN", url: "https://developer.mozilla.org", g: "doc", c: "#3A3F45" },
];

export const SWATCHES = [
  "#C96442", "#D14836", "#E4572E", "#D9A116", "#1DB954", "#1A9E5F",
  "#0E7C74", "#2F6FD0", "#5865F2", "#A259FF", "#C2185B", "#3A3F45",
];
