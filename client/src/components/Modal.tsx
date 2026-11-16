import { useEffect, type ReactNode } from "react";
import { X } from "lucide-react";

export default function Modal({
  title,
  onClose,
  children,
  top = false,
  wide = false,
}: {
  title: string;
  onClose: () => void;
  children: ReactNode;
  /** 宽一些的弹窗（看视频用） */
  wide?: boolean;
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
    <div className={`modal-backdrop fixed inset-0 ${top ? "z-[60]" : "z-50"} grid place-items-center bg-veil p-4 backdrop-blur-[6px]`} onMouseDown={onClose}>
      {/* 内容比窗口高时（小窗口、手机横屏）在弹窗里面滚，不会被屏幕裁掉 */}
      <div
        role="dialog"
        aria-modal="true"
        aria-label={title}
        className={`modal-panel glass-strong max-h-[calc(100dvh-2rem)] w-full overflow-y-auto overscroll-contain ${wide ? "max-w-3xl" : "max-w-lg"} rounded-[24px] p-5 sm:p-6`}
        onMouseDown={(e) => e.stopPropagation()}
      >
        <div className="mb-5 flex items-center justify-between gap-3">
          <h2 className="min-w-0 truncate text-lg font-semibold tracking-tight">{title}</h2>
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
    <div className="mb-6 flex flex-wrap items-end justify-between gap-x-4 gap-y-3">
      <div className="min-w-0">
        <h1 className="text-[28px] font-semibold leading-tight tracking-tight">{title}</h1>
        {sub && <p className="mt-1.5 text-sm text-slate-500">{sub}</p>}
      </div>
      {action && <div className="flex min-w-0 max-w-full flex-wrap items-center gap-2">{action}</div>}
    </div>
  );
}
