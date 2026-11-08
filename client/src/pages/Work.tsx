import { useEffect, useState, type FormEvent } from "react";
import { api, type Priority, type Task, type TaskStatus, today } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";

export const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-red-100 text-red-700" },
  medium: { label: "中", cls: "bg-amber-100 text-amber-700" },
  low: { label: "低", cls: "bg-stone-100 text-stone-600" },
};

const COLUMNS: { key: TaskStatus; label: string; tone: string }[] = [
  { key: "todo", label: "📝 待办", tone: "bg-stone-100" },
  { key: "doing", label: "🚧 进行中", tone: "bg-indigo-50" },
  { key: "done", label: "✅ 已完成", tone: "bg-emerald-50" },
];

type Draft = Omit<Task, "id" | "updated_at">;
const empty: Draft = { title: "", description: "", status: "todo", priority: "medium", due_date: null };

export default function Work() {
  const [tasks, setTasks] = useState<Task[]>([]);
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null);
  const [error, setError] = useState("");

  const load = () => api.get<Task[]>("/tasks").then(setTasks);
  useEffect(() => {
    load();
  }, []);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      if (editing.id) await api.put(`/tasks/${editing.id}`, editing.draft);
      else await api.post("/tasks", editing.draft);
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const move = async (t: Task, status: TaskStatus) => {
    await api.put(`/tasks/${t.id}`, { status });
    load();
  };

  const remove = async (t: Task) => {
    if (!confirm(`删除任务「${t.title}」？`)) return;
    await api.del(`/tasks/${t.id}`);
    load();
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const t0 = today();

  return (
    <div>
      <PageHeader
        title="💼 工作"
        sub="按优先级和截止日期排序"
        action={
          <button className="btn-primary" onClick={() => { setError(""); setEditing({ draft: { ...empty } }); }}>
            + 新建任务
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const list = tasks.filter((t) => t.status === col.key);
          return (
            <section key={col.key} className={`rounded-xl p-3 ${col.tone}`}>
              <h2 className="mb-3 flex items-center justify-between px-1 text-sm font-semibold">
                {col.label}
                <span className="rounded-full bg-white px-2 text-xs text-stone-500">{list.length}</span>
              </h2>
              <div className="space-y-2">
                {list.map((t) => {
                  const overdue = t.status !== "done" && t.due_date && t.due_date < t0;
                  return (
                    <article key={t.id} className="card group p-3">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-sm font-medium ${t.status === "done" ? "text-stone-400 line-through" : ""}`}>{t.title}</h3>
                        <span className={`shrink-0 rounded px-1.5 py-0.5 text-xs ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                      </div>
                      {t.description && <p className="mt-1 line-clamp-2 text-xs text-stone-500">{t.description}</p>}
                      {t.due_date && (
                        <p className={`mt-2 text-xs ${overdue ? "font-medium text-red-600" : "text-stone-500"}`}>
                          📅 {t.due_date} {overdue && "已逾期"}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                        {ci > 0 && (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => move(t, COLUMNS[ci - 1].key)}>
                            ← {COLUMNS[ci - 1].label.slice(2)}
                          </button>
                        )}
                        {ci < 2 && (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => move(t, COLUMNS[ci + 1].key)}>
                            {COLUMNS[ci + 1].label.slice(2)} →
                          </button>
                        )}
                        <button className="btn-ghost ml-auto px-2 py-1 text-xs" onClick={() => { setError(""); setEditing({ id: t.id, draft: { ...t } }); }}>
                          编辑
                        </button>
                        <button className="btn-danger px-2 py-1 text-xs" onClick={() => remove(t)}>
                          删除
                        </button>
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && <p className="py-6 text-center text-xs text-stone-400">空</p>}
              </div>
            </section>
          );
        })}
      </div>

      {editing && (
        <Modal title={editing.id ? "编辑任务" : "新建任务"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <div>
              <label className="label">标题</label>
              <input className="input" value={editing.draft.title} onChange={(e) => set("title", e.target.value)} autoFocus />
            </div>
            <div>
              <label className="label">描述</label>
              <textarea className="input min-h-24" value={editing.draft.description} onChange={(e) => set("description", e.target.value)} />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">状态</label>
                <select className="input" value={editing.draft.status} onChange={(e) => set("status", e.target.value as TaskStatus)}>
                  {COLUMNS.map((c) => (
                    <option key={c.key} value={c.key}>{c.label.slice(2)}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">优先级</label>
                <select className="input" value={editing.draft.priority} onChange={(e) => set("priority", e.target.value as Priority)}>
                  <option value="high">高</option>
                  <option value="medium">中</option>
                  <option value="low">低</option>
                </select>
              </div>
              <div>
                <label className="label">截止日期</label>
                <input className="input" type="date" value={editing.draft.due_date ?? ""} onChange={(e) => set("due_date", e.target.value || null)} />
              </div>
            </div>
            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn-primary">保存</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
