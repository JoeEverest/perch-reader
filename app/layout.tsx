import type { Metadata } from "next";
import { Young_Serif, Literata, Spline_Sans_Mono } from "next/font/google";
import "./globals.css";

const display = Young_Serif({
  weight: "400",
  subsets: ["latin"],
  variable: "--font-display",
});

const body = Literata({
  subsets: ["latin"],
  style: ["normal", "italic"],
  variable: "--font-body",
});

const mono = Spline_Sans_Mono({
  subsets: ["latin"],
  weight: ["400", "500"],
  variable: "--font-mono",
});

export const metadata: Metadata = {
  title: "Perch — articles, read aloud",
  description:
    "Paste a link or some text and a voice on your own machine reads it to you. Fully offline text-to-speech with Kokoro-82M.",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${display.variable} ${body.variable} ${mono.variable}`}>
      <body>{children}</body>
    </html>
  );
}
