import type { Metadata } from "next";
import { Inter } from "next/font/google";
import '@/styles/global.css'

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
});

export const metadata: Metadata = {
  title: "MediKeep - Intelligent Chronic Care Platform",
  description: "Unified health record management for chronic care patients and clinics",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.variable} antialiased`}>
        {children}
      </body>
    </html>
  );
}
