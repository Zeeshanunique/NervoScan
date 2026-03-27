import type { Metadata, Viewport } from "next";
import "./globals.css";
import Navbar from "./components/Navbar";
import ChatBot from "./components/ChatBot";

export const metadata: Metadata = {
  title: "NervoScan - AI Stress Detection",
  description:
    "Privacy-aware, offline-first stress detection using voice, face & keystroke analysis",
  manifest: "/manifest.json",
};

export const viewport: Viewport = {
  themeColor: "#6366f1",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/favicon.ico" sizes="any" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className="min-h-screen antialiased">
        <Navbar />
        <main className="pt-16">{children}</main>
        <ChatBot />
      </body>
    </html>
  );
}
