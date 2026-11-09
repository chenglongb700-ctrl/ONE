import { useEffect, type ReactNode } from "react";
import { X, type LucideIcon } from "lucide-react";

export default function Modal({
  title,
  onClose,
  children,
  top = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 叠在其他弹窗之上（确认框用） */
  top?: boolean;
}) {
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // 叠在上层的弹窗在捕获阶段先处理 Esc，并拦住它，下层弹窗不会跟着关闭
      if (top) e.stopImmediatePropagation();
      onClose();
    };
    window.addEventListener("keydown", onKey, top);
    return () => window.removeEventListener("keydown", onKey, top);
  }, [onClose, top]);

  return (
    <div className={`modal-backdrop fixed inset-0 ${top ? "z-[60]" : "z-50"} grid place-items-center bg-slate-900/20 p-4 backdrop-blur-sm`} onMouseDown={onClose}>
      <div className="modal-panel card w-full max-w-lg bg-white/70 p-6" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-lg font-semibold">{title}</h2>
          <button className="btn-ghost p-1.5" onClick={onClose} aria-label="关闭">
            <X className="size-4" />
          </button>
        </div>
        {children}
      </div>
    </div>
  );
}

export function ErrorText({ msg }: { msg: string }) {
  return msg ? <p className="text-sm text-red-600">{msg}</p> : null;
}

/** 页面标题：左边一个带颜色底的图标 */
export function PageHeader({
  title,
  sub,
  action,
  icon: Icon,
  tone = "bg-slate-800",
}: {
  title: string;
  sub?: string;
  action?: ReactNode;
  icon?: LucideIcon;
  tone?: string;
}) {
  return (
    <div className="mb-6 flex flex-wrap items-end justify-between gap-3">
      <div className="flex items-center gap-3">
        {Icon && (
          <span className={`grid size-10 place-items-center rounded-xl text-white shadow-md shadow-slate-900/10 ${tone}`}>
            <Icon className="size-5" strokeWidth={2.2} />
          </span>
        )}
        <div>
          <h1 className="text-2xl font-bold leading-tight">{title}</h1>
          {sub && <p className="mt-0.5 text-sm text-slate-500">{sub}</p>}
        </div>
      </div>
      {action}
    </div>
  );
}
