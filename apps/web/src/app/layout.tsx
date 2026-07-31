import type { Metadata } from "next";
import { Onest, Unbounded } from "next/font/google";

import "./globals.css";

const display = Unbounded({
  subsets: ["latin", "cyrillic", "cyrillic-ext"],
  variable: "--font-display",
  weight: ["500", "600", "700"],
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
    <html lang="ru" className={`${display.variable} ${sans.variable}`}>
      <body>{children}</body>
    </html>
  );
}
