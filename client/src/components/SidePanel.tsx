import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

/**
 * 右侧面板：和左边的侧边栏一个样子（同样的玻璃、圆角、上下留白），从右边滑出来。
 * 和弹窗不同，它不盖住、不虚化页面——AI 助手讲的就是这个页面，要能一边看回答一边看页面。
 * - 屏幕够宽（≥1400px）时像第三栏一样停在右边，页面内容和播放条往左让出位置（见 index.css 的 data-side-panel）
 * - 窄一些的屏幕上浮在页面右侧；手机上铺满整个屏幕
 * - Esc 或右上角的 × 关闭
 */
export default function SidePanel({ title, sub, actions, onClose, children }: { title: string; sub?: string; actions?: ReactNode; onClose: () => void; children: ReactNode }) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && onClose();
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [onClose]);

  // 告诉页面"右边有面板"，宽屏时让内容让位
  useEffect(() => {
    document.documentElement.dataset.sidePanel = "open";
    return () => {
      delete document.documentElement.dataset.sidePanel;
    };
  }, []);

  return (
    <section role="dialog" aria-label={title} className="side-panel glass-strong fixed inset-0 z-50 flex flex-col md:inset-auto md:bottom-3 md:right-3 md:top-3 md:w-[420px] md:rounded-[24px]">
      <header className="flex items-start gap-2 px-5 pb-3 pt-5">
        <div className="min-w-0 flex-1">
          <h2 className="truncate text-lg font-semibold tracking-tight">{title}</h2>
          {sub && <p className="mt-0.5 truncate text-xs text-slate-500">{sub}</p>}
        </div>
        {actions}
        <button className="btn-ghost -mr-1.5 p-1.5" onClick={onClose} aria-label="关闭" title="关闭（Esc）">
          <X className="size-4" />
        </button>
      </header>
      <div className="flex min-h-0 flex-1 flex-col px-5 pb-5">{children}</div>
    </section>
  );
}
