import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Toaster } from "sonner";
import NextTopLoader from "nextjs-toploader";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Padoca CRM",
  description: "Sistema de gestão para padarias e cafeterias.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="pt-BR">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased selection:bg-primary/20 selection:text-primary`}
      >
        <NextTopLoader color="#054F77" showSpinner={false} height={3} shadow="0 0 10px #054F77,0 0 5px #054F77" />
        {children}
        <Toaster position="top-right" richColors closeButton />
      </body>
    </html>
  );
}
