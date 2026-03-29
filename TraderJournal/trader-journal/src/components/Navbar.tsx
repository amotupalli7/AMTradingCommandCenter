"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "@/lib/utils";

export function Navbar() {
  const pathname = usePathname();

  return (
    <nav className="sticky top-0 z-50 bg-slate-950/90 backdrop-blur-md border-b border-slate-800">
      <div className="max-w-7xl mx-auto px-4 sm:px-6">
        <div className="flex items-center justify-between h-14">
          {/* Logo */}
          <Link href="/" className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-md bg-gradient-to-br from-blue-500 to-blue-700 flex items-center justify-center">
              <span className="text-white font-bold text-xs">TJ</span>
            </div>
            <span className="text-base font-semibold text-white tracking-tight">
              TraderJournal
            </span>
          </Link>

          {/* Tabs */}
          <div className="flex gap-1">
            <NavTab href="/analysis" active={pathname === "/analysis" || pathname === "/"}>
              Analysis
            </NavTab>
            <NavTab href="/dashboard" active={pathname === "/dashboard"}>
              Dashboard
            </NavTab>
          </div>
        </div>
      </div>
    </nav>
  );
}

function NavTab({
  href,
  active,
  children,
}: {
  href: string;
  active: boolean;
  children: React.ReactNode;
}) {
  return (
    <Link
      href={href}
      className={cn(
        "px-4 py-1.5 rounded-md text-sm font-medium transition-colors",
        active
          ? "text-white bg-blue-600/20 border border-blue-500/30"
          : "text-slate-400 hover:text-white hover:bg-slate-800"
      )}
    >
      {children}
    </Link>
  );
}
