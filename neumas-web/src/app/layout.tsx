import type { Metadata, Viewport } from "next";
import { IBM_Plex_Mono, Plus_Jakarta_Sans } from "next/font/google";
import "./globals.css";
import { Providers } from "@/components/providers";
import { ErrorBoundary } from "@/components/error-boundary";
import { PWARegistration } from "@/components/pwa-registration";
import { getCanonicalAppUrl } from "@/lib/app-url";
import { siteConfig } from "@/lib/public-site";

const plusJakarta = Plus_Jakarta_Sans({
  variable: "--font-neumas-sans",
  subsets: ["latin"],
  weight: ["400", "500", "700"],
});

const ibmPlexMono = IBM_Plex_Mono({
  variable: "--font-neumas-mono",
  subsets: ["latin"],
  weight: ["400", "500"],
});

export const metadata: Metadata = {
  metadataBase: new URL(getCanonicalAppUrl()),
  title: {
    default: "Neumas — AI Operations for F&B",
    template: "%s | Neumas",
  },
  description: siteConfig.description,
  keywords: [
    "AI operations for F&B",
    "restaurant inventory software",
    "F&B inventory intelligence",
    "receipt processing",
    "invoice processing",
    "reorder planning",
    "vendor intelligence",
    "cloud kitchen operations",
    "multi-location F&B operations",
    "restaurant forecasting",
    "Neumas",
  ],
  openGraph: {
    type: "website",
    siteName: "Neumas",
    title: "Neumas — AI Operations for F&B",
    description: siteConfig.description,
    images: [{ url: "/opengraph-image", width: 1200, height: 630, alt: "Neumas AI operations for F&B" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "Neumas — AI Operations for F&B",
    description: siteConfig.description,
    images: ["/twitter-image"],
  },
  alternates: {
    types: {
      "application/rss+xml": [{ url: "/feed.xml", title: "Neumas Resources" }],
    },
  },
  manifest: "/manifest.webmanifest",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Neumas",
  },
};

export const viewport: Viewport = {
  themeColor: "#0066FF",
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${plusJakarta.variable} ${ibmPlexMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground">
        <ErrorBoundary>
          <Providers>
            <PWARegistration />
            {children}
          </Providers>
        </ErrorBoundary>
      </body>
    </html>
  );
}
