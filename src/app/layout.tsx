import type { Metadata, Viewport } from "next";
import { Geist, Geist_Mono, Instrument_Serif } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const instrumentSerif = Instrument_Serif({
  variable: "--font-instrument-serif",
  weight: "400",
  style: ["normal", "italic"],
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Samvrith Bandi — from microvolts to meaning",
  description:
    "Electrical engineer building the whole signal chain: custom analog front-ends, on-device neural networks, and agent interfaces. Purdue ECE, Fall 2026.",
  openGraph: {
    title: "Samvrith Bandi — from microvolts to meaning",
    description:
      "Custom analog front-ends, on-device neural networks, and agent interfaces — the whole signal chain.",
    type: "website",
    siteName: "Samvrith Bandi",
  },
  twitter: {
    card: "summary",
    title: "Samvrith Bandi — from microvolts to meaning",
    description:
      "Custom analog front-ends, on-device neural networks, and agent interfaces — the whole signal chain.",
  },
};

export const viewport: Viewport = {
  themeColor: "#050508",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} ${instrumentSerif.variable} antialiased`}
      >
        <noscript>
          <style>{`[style*="opacity:0"],[style*="opacity: 0"]{opacity:1!important;transform:none!important}`}</style>
        </noscript>
        {children}
      </body>
    </html>
  );
}
