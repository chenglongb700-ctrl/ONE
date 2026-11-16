import { useState } from "react";
import { RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api } from "../api";

/**
 * 放在各个编辑窗口里的三个 AI 小按钮：给随记建议标题和标签、把任务拆成几步、估一样食物的热量。
 * 都是"点了才调用、给出建议、用户确认后才生效"。没配模型时点了会提示去配置。
 */
const LINK = "inline-flex cursor-pointer items-center gap-1 text-xs text-slate-600 underline-offset-4 hover:text-ink hover:underline disabled:cursor-default disabled:opacity-60 disabled:no-underline";

function Icon({ busy }: { busy: boolean }) {
  return busy ? <RefreshCw className="size-3.5 animate-spin" /> : <Sparkles className="size-3.5 text-brand" />;
}

/** 随记：根据正文建议一个标题和两三个标签，点「采用」才填进表单 */
export function JournalSuggest({ content, onApply }: { content: string; onApply: (title: string, tags: string[]) => void }) {
  const [busy, setBusy] = useState(false);
  const [got, setGot] = useState<{ title: string; tags: string[] } | null>(null);
  const [error, setError] = useState("");

  const ask = async () => {
    setBusy(true);
    setError("");
    setGot(null);
    try {
      setGot(await api.post<{ title: string; tags: string[] }>("/ai/journal-suggest", { content }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className={LINK} onClick={ask} disabled={busy} title="正文会发给你配置的 AI 模型">
        <Icon busy={busy} /> {busy ? "AI 正在看…" : "AI 建议标题和标签"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {got && (
        <div className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl bg-brand/10 px-3 py-2 text-sm">
          <span className="min-w-0 flex-1">
            <span className="font-medium">{got.title}</span>
            {got.tags.map((t) => (
              <span key={t} className="tag ml-2">
                #{t}
              </span>
            ))}
          </span>
          <span className="flex shrink-0 gap-1">
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setGot(null)}>
              不用
            </button>
            <button
              type="button"
              className="btn bg-ink/10 px-2.5 py-1 text-xs hover:bg-ink/15"
              onClick={() => {
                onApply(got.title, got.tags);
                setGot(null);
              }}
            >
              采用
            </button>
          </span>
        </div>
      )}
    </div>
  );
}

/** 任务：拆成几步，勾选要的，点「加入待办」才真的建出这些任务 */
export function TaskSplit({ title, description, onAdded }: { title: string; description: string; onAdded: () => void }) {
  const [busy, setBusy] = useState<"ask" | "add" | null>(null);
  const [steps, setSteps] = useState<{ text: string; on: boolean }[] | null>(null);
  const [error, setError] = useState("");

  const ask = async () => {
    if (title.trim().length < 2) return setError("先写任务标题");
    setBusy("ask");
    setError("");
    setSteps(null);
    try {
      const got = await api.post<{ steps: string[] }>("/ai/task-split", { title, description });
      setSteps(got.steps.map((text) => ({ text, on: true })));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const add = async () => {
    const picked = (steps ?? []).filter((s) => s.on && s.text.trim());
    if (picked.length === 0) return setError("没有勾选任何一步");
    setBusy("add");
    setError("");
    try {
      // 按顺序一个个建，都放进"待办"
      for (const s of picked) await api.post("/tasks", { title: s.text.trim(), description: `拆自：${title.trim()}`, status: "todo", priority: "medium", due_date: null });
      toast.success(`已把 ${picked.length} 步加入待办`);
      setSteps(null);
      onAdded();
    } catch (err) {
      setError((err as Error).message);
      onAdded(); // 前几步可能已经建上了，让列表刷新一下
    } finally {
      setBusy(null);
    }
  };

  return (
    <div>
      <button type="button" className={LINK} onClick={ask} disabled={busy !== null} title="任务的标题和描述会发给你配置的 AI 模型">
        <Icon busy={busy === "ask"} /> {busy === "ask" ? "AI 正在拆…" : "AI 把它拆成几步"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
      {steps && (
        <div className="mt-2 rounded-xl bg-brand/10 px-3 py-2.5">
          <ul className="space-y-1.5">
            {steps.map((s, i) => (
              <li key={i} className="flex items-center gap-2.5">
                <input type="checkbox" checked={s.on} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, on: e.target.checked } : x)))} aria-label={`加入这一步：${s.text}`} />
                <input className="input py-1 text-sm" value={s.text} maxLength={200} onChange={(e) => setSteps(steps.map((x, k) => (k === i ? { ...x, text: e.target.value } : x)))} aria-label={`第 ${i + 1} 步`} />
              </li>
            ))}
          </ul>
          <div className="mt-2.5 flex items-center justify-end gap-1">
            <span className="mr-auto text-xs text-slate-500">会作为新的任务放进「待办」，原任务不变</span>
            <button type="button" className="btn-ghost px-2 py-1 text-xs" onClick={() => setSteps(null)}>
              不用
            </button>
            <button type="button" className="btn bg-ink/10 px-2.5 py-1 text-xs hover:bg-ink/15" onClick={add} disabled={busy !== null}>
              {busy === "add" ? "正在添加…" : "加入待办"}
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/** 饮食：根据写的食物名估一个热量，填进表单后还可以改 */
export function FoodEstimate({ text, onResult }: { text: string; onResult: (r: { name: string; amount: string; kcal: number }) => void }) {
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");

  const ask = async () => {
    if (!text.trim()) return setError("先在「吃了什么」里写一下，比如：一碗牛肉面加个蛋");
    setBusy(true);
    setError("");
    try {
      onResult(await api.post<{ name: string; amount: string; kcal: number }>("/ai/food", { text }));
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <div>
      <button type="button" className={LINK} onClick={ask} disabled={busy} title="你写的食物名会发给你配置的 AI 模型">
        <Icon busy={busy} /> {busy ? "AI 正在估…" : "不知道热量？让 AI 估一下"}
      </button>
      {error && <p className="mt-1.5 text-xs text-red-600">{error}</p>}
    </div>
  );
}
