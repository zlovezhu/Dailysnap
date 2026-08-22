import { useEffect, useState } from "react";
import { Github } from "lucide-react";
import Cat from "../components/Cat";

const links = [
  { en: "APP", zh: "主窗口", href: "#demo" },
  { en: "FEATURES", zh: "功能", href: "#product" },
  { en: "COMPANION", zh: "养成", href: "#companion" },
  { en: "DOWNLOAD", zh: "下载", href: "#download" },
  { en: "CONTACT", zh: "联系", href: "#contact" },
];

export default function Nav() {
  const [scrolled, setScrolled] = useState(false);
  useEffect(() => {
    const onScroll = () => setScrolled(window.scrollY > 24);
    window.addEventListener("scroll", onScroll, { passive: true });
    return () => window.removeEventListener("scroll", onScroll);
  }, []);

  return (
    <header
      className={`fixed inset-x-0 top-0 z-50 transition-all duration-300 ${
        scrolled
          ? "bg-paper/90 backdrop-blur-md hairline-b"
          : "bg-paper/60 backdrop-blur-sm hairline-b-soft"
      }`}
    >
      <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-5 md:px-8">
        <a href="#top" className="flex items-center gap-2.5">
          <Cat mood="calm" size={56} />
          <span className="text-[19px] font-bold tracking-tight">DailySnap</span>
        </a>

        <nav className="hidden items-center gap-8 md:flex">
          {links.map((l) => (
            <a key={l.en} href={l.href} className="group text-center leading-none">
              <span className="label-caps block text-ink transition-colors group-hover:text-cat-brown">
                {l.en}
              </span>
              <span className="mt-1 block text-[11px] text-ink-faint transition-colors group-hover:text-ink">
                {l.zh}
              </span>
            </a>
          ))}
        </nav>

        <a
          href="https://github.com/zlovezhu/Dailysnap"
          target="_blank"
          rel="noreferrer"
          className="btn-ink flex items-center gap-2 px-3.5 py-2 text-[13px] font-medium"
        >
          <Github size={15} />
          <span className="hidden sm:inline">GitHub</span>
        </a>
      </div>
    </header>
  );
}
