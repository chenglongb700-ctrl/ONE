import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, ArrowRight, Briefcase, CalendarDays, CircleCheckBig, CircleDashed, Pencil, Plus, Timer, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api, type Priority, type Task, type TaskStatus, today } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { AnimatedDiv } from "../components/Animated";

export const PRIORITY: Record<Priority, { label: string; cls: string }> = {
  high: { label: "高", cls: "bg-red-100 text-red-700" },
  medium: { label: "中", cls: "bg-amber-100 text-amber-700" },
  low: { label: "低", cls: "bg-ink/6 text-slate-600" },
};

const COLUMNS: { key: TaskStatus; label: string; icon: LucideIcon; iconCls: string }[] = [
  { key: "todo", label: "待办", icon: CircleDashed, iconCls: "text-slate-500" },
  { key: "doing", label: "进行中", icon: Timer, iconCls: "text-brand" },
  { key: "done", label: "已完成", icon: CircleCheckBig, iconCls: "text-emerald-600" },
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
      toast.success(editing.id ? "任务已更新" : "任务已创建");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const move = async (t: Task, status: TaskStatus) => {
    // 先在界面上移动，看起来更跟手；失败再刷新
    setTasks((ts) => ts.map((x) => (x.id === t.id ? { ...x, status } : x)));
    try {
      await api.put(`/tasks/${t.id}`, { status });
      if (status === "done") toast.success(`完成「${t.title}」`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const remove = async (t: Task) => {
    if (!(await confirmDialog({ title: "删除任务？", message: `「${t.title}」删除后无法恢复。` }))) return;
    try {
      await api.del(`/tasks/${t.id}`);
      toast.success("任务已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const t0 = today();

  return (
    <div>
      <PageHeader
        title="工作"
        sub="按优先级和截止日期排序"
        action={
          <button className="btn-primary" onClick={() => { setError(""); setEditing({ draft: { ...empty } }); }}>
            <Plus className="size-4" /> 新建任务
          </button>
        }
      />

      <div className="grid gap-4 md:grid-cols-3">
        {COLUMNS.map((col, ci) => {
          const list = tasks.filter((t) => t.status === col.key);
          return (
            <section key={col.key} className="rounded-[18px] bg-ink/[0.04] p-2.5">
              <h2 className="mb-2.5 flex items-center gap-2 px-1.5 pt-1 text-sm font-medium">
                <col.icon className={`size-4 ${col.iconCls}`} />
                {col.label}
                <span className="ml-auto text-xs tabular-nums text-slate-400">{list.length}</span>
              </h2>
              <AnimatedDiv className="space-y-2">
                {list.map((t) => {
                  const overdue = t.status !== "done" && t.due_date && t.due_date < t0;
                  return (
                    <article key={t.id} className="card group p-3 transition card-link">
                      <div className="flex items-start justify-between gap-2">
                        <h3 className={`text-sm font-medium ${t.status === "done" ? "text-slate-400 line-through" : ""}`}>{t.title}</h3>
                        <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                      </div>
                      {t.description && <p className="mt-1 line-clamp-2 text-xs text-slate-500">{t.description}</p>}
                      {t.due_date && (
                        <p className={`mt-2 flex items-center gap-1 text-xs ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                          <CalendarDays className="size-3.5" /> {t.due_date} {overdue && "已逾期"}
                        </p>
                      )}
                      <div className="mt-2 flex flex-wrap items-center gap-1 opacity-100 transition md:opacity-0 md:group-hover:opacity-100">
                        {ci > 0 && (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => move(t, COLUMNS[ci - 1].key)}>
                            <ArrowLeft className="size-3.5" /> {COLUMNS[ci - 1].label}
                          </button>
                        )}
                        {ci < 2 && (
                          <button className="btn-ghost px-2 py-1 text-xs" onClick={() => move(t, COLUMNS[ci + 1].key)}>
                            {COLUMNS[ci + 1].label} <ArrowRight className="size-3.5" />
                          </button>
                        )}
                        <button className="btn-ghost ml-auto p-1.5" title="编辑" aria-label="编辑" onClick={() => { setError(""); setEditing({ id: t.id, draft: { ...t } }); }}>
                          <Pencil className="size-3.5" />
                        </button>
                        <button className="btn-danger p-1.5" title="删除" aria-label="删除" onClick={() => remove(t)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </div>
                    </article>
                  );
                })}
                {list.length === 0 && <p key="empty" className="py-6 text-center text-xs text-slate-400">空</p>}
              </AnimatedDiv>
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
                    <option key={c.key} value={c.key}>{c.label}</option>
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
