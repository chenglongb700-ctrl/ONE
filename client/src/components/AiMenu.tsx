import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { useLocation } from "react-router-dom";
import { Lightbulb, MessageCircleQuestion, PencilLine, Sparkles } from "lucide-react";
import AiAsk from "./AiAsk";
import AiCapture from "./AiCapture";
import { pageAiFor } from "./pageAi";

/**
 * 每个页面右上角的 AI 按钮。点开第一项是当前页面自己的助手（在哪个页面就是哪个页面的），
 * 下面是哪个页面都一样的「记一笔」和「问我的数据」。
 */
export default function AiMenu() {
  const [open, setOpen] = useState(false);
  const [dialog, setDialog] = useState<"page" | "capture" | "ask" | null>(null);
  const page = pageAiFor(useLocation().pathname);
  const box = useRef<HTMLDivElement>(null);

  // 点菜单外面、按 Esc 都收起菜单
  useEffect(() => {
    if (!open) return;
    const away = (e: MouseEvent) => !box.current?.contains(e.target as Node) && setOpen(false);
    const esc = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [open]);

  const pick = (d: "page" | "capture" | "ask") => {
    setOpen(false);
    setDialog(d);
  };
  const item = "flex w-full cursor-pointer items-start gap-2.5 rounded-[10px] px-2.5 py-2 text-left transition hover:bg-ink/8";

  return (
    <div ref={box} className="relative shrink-0">
      <button className="flex h-[34px] cursor-pointer items-center gap-1.5 rounded-full bg-surface px-3 text-sm ring-1 ring-line transition hover:ring-ink/30" onClick={() => setOpen(!open)} aria-haspopup="menu" aria-expanded={open}>
        <Sparkles className="size-3.5 text-brand" /> AI
      </button>
      {open && (
        <div role="menu" className="glass-strong modal-panel absolute right-0 top-[calc(100%+6px)] z-40 w-60 rounded-2xl p-1.5">
          {page && (
            <>
              <button role="menuitem" className={item} onClick={() => pick("page")}>
                <Lightbulb className="mt-0.5 size-4 shrink-0 text-brand" />
                <span>
                  <span className="block text-sm font-medium">{page.name}助手</span>
                  <span className="block text-xs text-slate-500">{page.hint}</span>
                </span>
              </button>
              <div className="mx-2.5 my-1 border-t border-line" />
            </>
          )}
          <button role="menuitem" className={item} onClick={() => pick("capture")}>
            <PencilLine className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>
              <span className="block text-sm font-medium">记一笔</span>
              <span className="block text-xs text-slate-500">用大白话写，AI 拆成任务、记账、饮食、运动…</span>
            </span>
          </button>
          <button role="menuitem" className={item} onClick={() => pick("ask")}>
            <MessageCircleQuestion className="mt-0.5 size-4 shrink-0 text-brand" />
            <span>
              <span className="block text-sm font-medium">问我的数据</span>
              <span className="block text-xs text-slate-500">跨页面地问：花销、任务、体重、运动…</span>
            </span>
          </button>
        </div>
      )}
      {/* 弹窗挂到 body 上，不受这一条的布局影响 */}
      {dialog === "capture" && createPortal(<AiCapture onClose={() => setDialog(null)} />, document.body)}
      {dialog === "ask" && createPortal(<AiAsk onClose={() => setDialog(null)} />, document.body)}
      {dialog === "page" && page && createPortal(<AiAsk key={page.key} page={page} onClose={() => setDialog(null)} />, document.body)}
    </div>
  );
}
