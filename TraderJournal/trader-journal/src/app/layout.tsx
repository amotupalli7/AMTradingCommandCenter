import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Navbar } from "@/components/Navbar";
import { FilterProvider } from "@/context/FilterContext";
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
  title: "TraderJournal",
  description: "Personal trading journal and analysis tool",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="dark">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased bg-slate-950 text-slate-200 min-h-screen`}
      >
        <FilterProvider>
          <Navbar />
          <main className="max-w-7xl mx-auto px-4 sm:px-6 py-6">
            {children}
          </main>
        </FilterProvider>
      </body>
    </html>
  );
}
