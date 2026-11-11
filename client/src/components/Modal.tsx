import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

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
    <div className={`modal-backdrop fixed inset-0 ${top ? "z-[60]" : "z-50"} grid place-items-center bg-veil p-4 backdrop-blur-[3px]`} onMouseDown={onClose}>
      <div role="dialog" aria-modal="true" aria-label={title} className="modal-panel w-full max-w-lg rounded-[22px] border border-line bg-surface p-6 shadow-2xl shadow-black/20" onMouseDown={(e) => e.stopPropagation()}>
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="text-lg font-medium">{title}</h2>
          <button className="btn-ghost -mr-1.5 p-1.5" onClick={onClose} aria-label="关闭">
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

/** 页面标题：只靠字号和字重说话，右边放这一页的主要操作 */
export function PageHeader({ title, sub, action }: { title: string; sub?: string; action?: ReactNode }) {
  return (
    <div className="mb-7 flex flex-wrap items-end justify-between gap-3">
      <div>
        <h1 className="text-[28px] font-light leading-tight tracking-wide">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {action}
    </div>
  );
}
