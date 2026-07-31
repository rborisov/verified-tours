import type { Metadata } from "next";
import { Cormorant_Garamond, Onest, Syne } from "next/font/google";

import "./globals.css";

const display = Syne({
  subsets: ["latin"],
  variable: "--font-display",
  weight: ["600", "700", "800"],
});

const quote = Cormorant_Garamond({
  subsets: ["latin", "cyrillic"],
  variable: "--font-quote",
  weight: ["400", "500", "600"],
  style: ["normal", "italic"],
});

const sans = Onest({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-sans",
  weight: ["400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "NoFakeTours — без фейковых туров",
  description:
    "Поиск пакетных туров агентом с ручной верификацией цены, города вылета и дат",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ru" className={`${display.variable} ${quote.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
