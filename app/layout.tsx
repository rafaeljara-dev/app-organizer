import type { Metadata, Viewport } from "next";
import { Onest } from "next/font/google";
import "./globals.css";
import RegisterSW from "@/components/RegisterSW";

const onest = Onest({
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
  variable: "--font-ui",
  display: "swap",
});

const base = process.env.NEXT_PUBLIC_BASE_PATH ?? "";

export const metadata: Metadata = {
  title: "Estante",
  description:
    "Organiza las webapps que usas de vez en cuando en una pantalla de inicio propia, sin instalar nada más.",
  applicationName: "Estante",
  manifest: `${base}/manifest.webmanifest`,
  appleWebApp: { capable: true, title: "Estante", statusBarStyle: "default" },
  icons: {
    icon: [{ url: `${base}/icons/icon-192.png`, sizes: "192x192", type: "image/png" }],
    apple: [{ url: `${base}/icons/apple-touch-icon.png`, sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#E8E9E6" },
    { media: "(prefers-color-scheme: dark)", color: "#0A1013" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="es" className={onest.variable} suppressHydrationWarning>
      <body>
        {children}
        <RegisterSW />
      </body>
    </html>
  );
}
