import { motion } from "framer-motion";
import { ArrowUpRight, Bug, Github, MessageSquareHeart } from "lucide-react";
import Cat from "../components/Cat";

const channels = [
  {
    icon: Github,
    label: "GitHub 主页",
    desc: "@zlovezhu · 看看作者还在造什么",
    href: "https://github.com/zlovezhu",
  },
  {
    icon: Bug,
    label: "提 Issue",
    desc: "bug、建议、许愿，都往这里丢",
    href: "https://github.com/zlovezhu/Dailysnap/issues",
  },
  {
    icon: MessageSquareHeart,
    label: "给个 Star",
    desc: "不花钱的鼓励，猫也能分到一半",
    href: "https://github.com/zlovezhu/Dailysnap",
  },
];

export default function Contact() {
  return (
    <section id="contact" className="bg-ink py-24 text-paper md:py-32">
      <div className="mx-auto max-w-6xl px-5 md:px-8">
        <motion.div
          initial={{ opacity: 0, y: 24 }}
          whileInView={{ opacity: 1, y: 0 }}
          viewport={{ once: true, margin: "-80px" }}
          transition={{ duration: 0.6 }}
          className="flex flex-col items-start gap-10 md:flex-row md:items-center md:justify-between"
        >
          <div>
            <p className="label-caps text-paper/50">CONTACT / 联系</p>
            <h2 className="mt-4 text-[30px] font-semibold leading-snug tracking-tight md:text-[40px]">
              想聊聊？
              <br />
              猫帮你转达。
            </h2>
          </div>
          <Cat mood="satisfied" size={150} className="hidden md:block" autoCalmAfter={999999} />
        </motion.div>

        <div className="mt-12 divide-y divide-paper/15 border-y border-paper/15">
          {channels.map((c, i) => (
            <motion.a
              key={c.label}
              href={c.href}
              target="_blank"
              rel="noreferrer"
              initial={{ opacity: 0, y: 18 }}
              whileInView={{ opacity: 1, y: 0 }}
              viewport={{ once: true, margin: "-40px" }}
              transition={{ delay: i * 0.08, duration: 0.5 }}
              className="group flex items-center gap-5 py-6 transition-colors hover:bg-paper/5 md:px-4"
            >
              <c.icon size={20} className="shrink-0 text-cat" />
              <div className="flex-1">
                <p className="text-[17px] font-medium">{c.label}</p>
                <p className="mt-0.5 text-[13px] text-paper/55">{c.desc}</p>
              </div>
              <ArrowUpRight
                size={18}
                className="text-paper/40 transition-all group-hover:translate-x-1 group-hover:text-paper"
              />
            </motion.a>
          ))}
        </div>

        <motion.p
          initial={{ opacity: 0 }}
          whileInView={{ opacity: 1 }}
          viewport={{ once: true }}
          transition={{ delay: 0.3, duration: 0.6 }}
          className="mt-8 text-[12.5px] text-paper/45"
        >
          猫说：有问题就去提 Issue——它会盯着作者修的，盯得可紧了。
        </motion.p>
      </div>
    </section>
  );
}
