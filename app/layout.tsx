import type { Metadata } from "next";
import { Anton, Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin", "latin-ext"],
  display: "swap",
  variable: "--font-inter",
});

const anton = Anton({
  subsets: ["latin", "latin-ext"],
  weight: "400",
  display: "swap",
  variable: "--font-anton",
});

export const metadata: Metadata = {
  title: "Stúdió bérlés – MD Dance School",
  description:
    "Bérelj táncstúdiót Budapesten: négy felszerelt terem az Astoria és az Opera közelében, online időpontfoglalással.",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="hu" className={`${inter.variable} ${anton.variable}`}>
      <body>{children}</body>
    </html>
  );
}
