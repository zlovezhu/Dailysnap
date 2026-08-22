import { motion } from "framer-motion";
import { Download as DownloadIcon } from "lucide-react";

const WIN_DOWNLOAD = "/downloads/DailySnap_0.1.1_x64-setup.exe";

export default function Download() {
  return (
    <section id="download" className="mx-auto max-w-6xl px-5 py-24 md:px-8 md:py-32">
      <motion.div
        initial={{ opacity: 0, y: 24 }}
        whileInView={{ opacity: 1, y: 0 }}
        viewport={{ once: true, margin: "-80px" }}
        transition={{ duration: 0.6 }}
        className="flex flex-wrap items-end justify-between gap-8"
      >
        <div>
          <p className="label-caps text-ink-faint">DOWNLOAD / 下载</p>
          <h2 className="mt-4 text-[30px] font-semibold tracking-tight md:text-[40px]">
            把猫领回家。
          </h2>
        </div>
        <motion.img
          src="/icon/app-icon.png"
          alt="DailySnap 应用图标"
          className="h-32 w-32 shrink-0 drop-shadow-lg md:h-40 md:w-40"
          initial={{ opacity: 0, rotate: -6, scale: 0.9 }}
          whileInView={{ opacity: 1, rotate: 0, scale: 1 }}
          viewport={{ once: true }}
          transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        />
      </motion.div>

      <div className="mt-10 flex flex-col gap-3 max-w-xl">
        <a
          href={WIN_DOWNLOAD}
          download
          className="btn-ink flex items-center justify-between px-5 py-3.5 text-[14px] font-medium"
        >
          <span className="flex items-center gap-2.5">
            <DownloadIcon size={16} />
            Windows（.exe，双击安装）
          </span>
          <span className="font-mono2 text-[11px] opacity-60">x64 · 19MB</span>
        </a>
        <div
          className="btn-ghost flex cursor-not-allowed items-center justify-between px-5 py-3.5 text-[14px] font-medium opacity-60"
          aria-disabled="true"
        >
          <span className="flex items-center gap-2.5">
            <DownloadIcon size={16} />
            macOS
          </span>
          <span className="text-[11px] text-ink-faint">敬请期待</span>
        </div>
        <p className="mt-2 text-[12px] leading-relaxed text-ink-faint">
          · Windows 如遇 SmartScreen 提示，点「更多信息」→「仍要运行」即可。
        </p>
      </div>
    </section>
  );
}
