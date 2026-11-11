import { useEffect, useRef, useState } from "react";
import { TriangleAlert } from "lucide-react";
import Modal from "./Modal";

/**
 * 替代浏览器自带的 confirm()：
 *   if (!(await confirmDialog({ title: "删除任务？", message: "..." }))) return;
 * 页面里只需要挂一次 <ConfirmHost />（在 main.tsx）。
 */
type Options = { title: string; message?: string; confirmText?: string; danger?: boolean };
type Request = Options & { resolve: (ok: boolean) => void };

let show: ((r: Request) => void) | null = null;

export function confirmDialog(opts: Options): Promise<boolean> {
  return new Promise((resolve) => {
    if (!show) return resolve(window.confirm(opts.title)); // 兜底：宿主还没挂载
    show({ ...opts, resolve });
  });
}

export function ConfirmHost() {
  const [req, setReq] = useState<Request | null>(null);
  const okRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    show = setReq;
    return () => {
      show = null;
    };
  }, []);

  useEffect(() => {
    if (req) okRef.current?.focus();
  }, [req]);

  if (!req) return null;
  const close = (ok: boolean) => {
    req.resolve(ok);
    setReq(null);
  };
  const danger = req.danger ?? true;

  return (
    <Modal title={req.title} onClose={() => close(false)} top>
      <div className="flex gap-3">
        {danger && (
          <span className="grid size-9 shrink-0 place-items-center rounded-full bg-red-100 text-red-600">
            <TriangleAlert className="size-4.5" />
          </span>
        )}
        {req.message && <p className="pt-1.5 text-sm text-slate-600">{req.message}</p>}
      </div>
      <div className="mt-6 flex justify-end gap-2">
        <button className="btn-ghost" onClick={() => close(false)}>
          取消
        </button>
        <button
          ref={okRef}
          className={danger ? "btn bg-red-600 text-paper hover:bg-red-700" : "btn-primary"}
          onClick={() => close(true)}
        >
          {req.confirmText ?? (danger ? "删除" : "确定")}
        </button>
      </div>
    </Modal>
  );
}
