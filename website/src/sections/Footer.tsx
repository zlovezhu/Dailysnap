import Cat from "../components/Cat";

export default function Footer() {
  return (
    <footer className="bg-ink py-12 text-paper">
      <div className="mx-auto flex max-w-6xl flex-col items-start justify-between gap-8 px-5 md:flex-row md:items-center md:px-8">
        <div className="flex items-center gap-3">
          <Cat mood="sleepy" size={48} autoCalmAfter={999999} />
          <div>
            <p className="text-[15px] font-semibold">DailySnap</p>
            <p className="mt-0.5 text-[11.5px] text-paper/45">
              记忆是透明的 Markdown · MIT License
            </p>
          </div>
        </div>

        <div className="flex gap-8 text-[12.5px] text-paper/60">
          <a href="https://github.com/zlovezhu/Dailysnap" target="_blank" rel="noreferrer" className="hover:text-paper">
            GitHub
          </a>
          <a href="https://github.com/zlovezhu/Dailysnap/releases" target="_blank" rel="noreferrer" className="hover:text-paper">
            Releases
          </a>
          <a href="https://github.com/zlovezhu/Dailysnap/issues" target="_blank" rel="noreferrer" className="hover:text-paper">
            Issues
          </a>
        </div>

        <p className="text-[11.5px] text-paper/40">© 2026 zlovezhu · 一只猫出品的官网</p>
      </div>
    </footer>
  );
}
