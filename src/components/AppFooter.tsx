import Image from "next/image";

type Props = {
  className?: string;
};

export default function AppFooter({ className }: Props) {
  return (
    <footer
      className={[
        "border-t border-slate-200 px-6 py-6 text-sm text-slate-500 dark:border-white/10 dark:text-slate-400",
        className ?? "",
      ].join(" ")}
    >
      <div className="mx-auto flex w-full max-w-6xl items-center justify-center gap-2">
        <span>© 2026</span>
        <Image
          src="https://uselbgcshlnpsitzlaut.supabase.co/storage/v1/object/public/imgs/image%20(25).png"
          alt="HAPP.IO Logo"
          height={24}
          width={120}
          className="h-6 w-auto rounded-lg"
        />
        <span>All Rights Reserved</span>
      </div>
    </footer>
  );
}
