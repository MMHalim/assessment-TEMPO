"use client";

import Image from "next/image";
import Link from "next/link";
import { useRouter, usePathname } from "next/navigation";
import { useTheme } from "next-themes";
import { Moon, Sun, ArrowRight } from "lucide-react";
import { useEffect, useState } from "react";

const TEMPO_LOGO_URL =
  "https://kupaxfvjfobfdgtbfnnt.supabase.co/storage/v1/object/sign/ChatData/tempo%20logo.jpg?token=eyJraWQiOiJzdG9yYWdlLXVybC1zaWduaW5nLWtleV85MTRiZGFkMi1kYjM2LTQ2MDMtYjlmZS04Y2ZiOTUxMGQwMDkiLCJhbGciOiJIUzI1NiJ9.eyJ1cmwiOiJDaGF0RGF0YS90ZW1wbyBsb2dvLmpwZyIsImlhdCI6MTc3NDQ4NDE4OSwiZXhwIjo4NjU3NzQzOTc3ODl9.VUnPOFchRXkSYiYFH5RSzzdFFkhXmRepdNYMjHhCgb4";

export default function AppHeader() {
  const router = useRouter();
  const pathname = usePathname();
  const { theme, setTheme } = useTheme();
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const handleLogoClick = (e: React.MouseEvent) => {
    e.preventDefault();
    if (pathname === "/admin") {
      router.push("/");
    } else {
      router.push("/admin");
    }
  };

  return (
    <>
      <header className="flex items-center justify-between px-6 py-4 border-b border-slate-200 dark:border-white/10 bg-white/80 dark:bg-black/80 backdrop-blur-md sticky top-0 z-50">
      <Link href="/" onClick={handleLogoClick} className="flex items-center gap-3">
        <Image
          src={TEMPO_LOGO_URL}
          alt="Qualify logo"
          width={44}
          height={44}
          className="h-11 w-11 rounded-2xl object-cover shadow-card"
          priority
        />
        <div className="leading-tight">
          <div className="text-lg font-bold tracking-tight">Qualify</div>
        </div>
      </Link>
      <div className="flex items-center gap-4">
        {pathname === "/" && (
          <Link className="btn btn-primary" href="/start">
            Start assessment <ArrowRight className="h-4 w-4" />
          </Link>
        )}
        {mounted && (
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className="rounded-full p-2 text-slate-500 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-white/10 dark:hover:text-white"
            aria-label="Toggle theme"
          >
            {theme === "dark" ? (
              <Sun className="h-5 w-5" />
            ) : (
              <Moon className="h-5 w-5" />
            )}
          </button>
        )}
      </div>
    </header>
    </>
  );
}
