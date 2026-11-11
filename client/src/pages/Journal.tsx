import { useEffect, useMemo, useState, type FormEvent } from "react";
import { CalendarDays, PenLine, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Journal, today } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { AnimatedDiv } from "../components/Animated";

const MOODS = ["😊", "😄", "🥰", "😌", "😐", "🤔", "😔", "😢", "😤", "😴"];

type Draft = Omit<Journal, "id">;

const splitTags = (s: string) =>
  s
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

export default function JournalPage() {
  const [list, setList] = useState<Journal[]>([]);
  const [q, setQ] = useState("");
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null);
  const [viewing, setViewing] = useState<Journal | null>(null);
  const [error, setError] = useState("");

  const load = () => api.get<Journal[]>("/journals").then(setList);
  useEffect(() => {
    load();
  }, []);

  const allTags = useMemo(() => [...new Set(list.flatMap((j) => splitTags(j.tags)))], [list]);
  const shown = list.filter(
    (j) =>
      (!tag || splitTags(j.tags).includes(tag)) &&
      (!q || j.title.includes(q) || j.content.includes(q)),
  );

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const draft = { ...editing.draft, tags: splitTags(editing.draft.tags).join(",") };
    try {
      if (editing.id) await api.put(`/journals/${editing.id}`, draft);
      else await api.post("/journals", draft);
      toast.success(editing.id ? "已保存修改" : "已记下这篇感悟");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (j: Journal) => {
    if (!(await confirmDialog({ title: "删除这篇感悟？", message: `「${j.title}」删除后无法恢复。` }))) return;
    try {
      await api.del(`/journals/${j.id}`);
      toast.success("已删除");
      setViewing(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const openEdit = (j?: Journal) => {
    setError("");
    setViewing(null);
    setEditing(j ? { id: j.id, draft: { ...j } } : { draft: { title: "", content: "", mood: "😊", tags: "", date: today() } });
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  return (
    <div>
      <PageHeader
        title="感悟"
        sub="记录想法、心情与成长"
        action={<button className="btn-primary" onClick={() => openEdit()}><Plus className="size-4" /> 写一篇</button>}
      />

      <div className="mb-4 space-y-3">
        <div className="relative max-w-sm">
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
          <input className="input pl-9" placeholder="搜索标题或内容…" value={q} onChange={(e) => setQ(e.target.value)} />
        </div>
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={tag === t ? "chip-on" : "chip"}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">{list.length ? "没有匹配的记录" : "还没有感悟，写下今天的想法吧"}</div>
      ) : (
        <AnimatedDiv className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((j) => (
            <article key={j.id} className="card card-link cursor-pointer" onClick={() => setViewing(j)}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span className="flex items-center gap-1"><CalendarDays className="size-3.5" />{j.date}</span>
                <span className="text-xl">{j.mood}</span>
              </div>
              <h3 className="mt-2 font-medium">{j.title}</h3>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{j.content}</p>
              {j.tags && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {splitTags(j.tags).map((t) => (
                    <span key={t} className="tag">#{t}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </AnimatedDiv>
      )}

      {viewing && (
        <Modal title={`${viewing.mood} ${viewing.title}`} onClose={() => setViewing(null)}>
          <p className="mb-3 text-xs text-slate-500">{viewing.date}</p>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{viewing.content || <span className="text-slate-400">（无内容）</span>}</div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-danger" onClick={() => remove(viewing)}><Trash2 className="size-4" /> 删除</button>
            <button className="btn-primary" onClick={() => openEdit(viewing)}><PenLine className="size-4" /> 编辑</button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? "编辑感悟" : "写一篇"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-[1fr_auto] gap-3">
              <div>
                <label className="label">标题</label>
                <input className="input" value={editing.draft.title} onChange={(e) => set("title", e.target.value)} autoFocus />
              </div>
              <div>
                <label className="label">日期</label>
                <input className="input" type="date" value={editing.draft.date} onChange={(e) => set("date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">心情</label>
              <div className="flex flex-wrap gap-1">
                {MOODS.map((m) => (
                  <button
                    type="button"
                    key={m}
                    onClick={() => set("mood", m)}
                    className={`rounded-lg p-1.5 text-xl transition ${editing.draft.mood === m ? "bg-brand/10 ring-2 ring-brand" : "hover:bg-ink/6"}`}
                  >
                    {m}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">内容</label>
              <textarea className="input min-h-48" value={editing.draft.content} onChange={(e) => set("content", e.target.value)} placeholder="今天有什么想说的…" />
            </div>
            <div>
              <label className="label">标签（用逗号或空格分隔）</label>
              <input className="input" value={editing.draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="成长, 读书" />
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
