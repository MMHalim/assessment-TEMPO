import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";
import { ThemeProvider } from "@/components/ThemeProvider";
import AppHeader from "@/components/AppHeader";
import AppFooter from "@/components/AppFooter";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "Qualify",
  description: "Candidate assessment and scoring",
  icons: {
    icon: [
      {
        url: "https://uselbgcshlnpsitzlaut.supabase.co/storage/v1/object/public/imgs/image%20(26).png?v=1",
        type: "image/png",
      },
    ],
    shortcut: [
      {
        url: "https://uselbgcshlnpsitzlaut.supabase.co/storage/v1/object/public/imgs/image%20(26).png?v=1",
        type: "image/png",
      },
    ],
    apple: [
      {
        url: "https://uselbgcshlnpsitzlaut.supabase.co/storage/v1/object/public/imgs/image%20(26).png?v=1",
        type: "image/png",
      },
    ],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
      suppressHydrationWarning
    >
      <body className="min-h-full flex flex-col bg-slate-50 text-slate-900 dark:bg-black dark:text-white">
        <ThemeProvider attribute="class" defaultTheme="dark" enableSystem={false}>
          <div className="flex flex-1 flex-col relative overflow-hidden min-h-screen">
            <div className="pointer-events-none absolute inset-0 overflow-hidden z-0">
              <div className="absolute -top-40 left-1/2 h-[520px] w-[520px] -translate-x-1/2 rounded-full bg-gradient-to-br from-indigo-500/20 via-sky-400/20 to-emerald-400/20 blur-3xl" />
            </div>

            <div className="z-10 flex flex-col flex-1">
              <AppHeader />
              {children}
              <AppFooter />
            </div>
          </div>
        </ThemeProvider>
      </body>
    </html>
  );
}
