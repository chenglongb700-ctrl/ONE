import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type Journal, today } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";

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
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (j: Journal) => {
    if (!confirm(`删除「${j.title}」？`)) return;
    await api.del(`/journals/${j.id}`);
    setViewing(null);
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
      <PageHeader title="✍️ 感悟" sub="记录想法、心情与成长" action={<button className="btn-primary" onClick={() => openEdit()}>+ 写一篇</button>} />

      <div className="mb-4 space-y-3">
        <input className="input max-w-sm" placeholder="🔍 搜索标题或内容…" value={q} onChange={(e) => setQ(e.target.value)} />
        {allTags.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {allTags.map((t) => (
              <button
                key={t}
                onClick={() => setTag(tag === t ? null : t)}
                className={`rounded-full px-3 py-1 text-xs transition ${tag === t ? "bg-amber-500 text-white" : "bg-white/50 text-slate-600 ring-1 ring-white/70 backdrop-blur-md hover:bg-white/70"}`}
              >
                #{t}
              </button>
            ))}
          </div>
        )}
      </div>

      {shown.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">{list.length ? "没有匹配的记录" : "还没有感悟，写下今天的想法吧 ✨"}</div>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
          {shown.map((j) => (
            <article key={j.id} className="card cursor-pointer border-t-4 border-t-amber-300 transition hover:-translate-y-0.5 hover:shadow-md" onClick={() => setViewing(j)}>
              <div className="flex items-center justify-between text-xs text-slate-500">
                <span>{j.date}</span>
                <span className="text-xl">{j.mood}</span>
              </div>
              <h3 className="mt-2 font-semibold">{j.title}</h3>
              <p className="mt-1 line-clamp-4 whitespace-pre-wrap text-sm text-slate-600">{j.content}</p>
              {j.tags && (
                <div className="mt-3 flex flex-wrap gap-1">
                  {splitTags(j.tags).map((t) => (
                    <span key={t} className="rounded bg-amber-50 px-1.5 py-0.5 text-xs text-amber-700">#{t}</span>
                  ))}
                </div>
              )}
            </article>
          ))}
        </div>
      )}

      {viewing && (
        <Modal title={`${viewing.mood} ${viewing.title}`} onClose={() => setViewing(null)}>
          <p className="mb-3 text-xs text-slate-500">{viewing.date}</p>
          <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{viewing.content || <span className="text-slate-400">（无内容）</span>}</div>
          <div className="mt-4 flex justify-end gap-2">
            <button className="btn-danger" onClick={() => remove(viewing)}>删除</button>
            <button className="btn-primary" onClick={() => openEdit(viewing)}>编辑</button>
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
                    className={`rounded-lg p-1.5 text-xl transition ${editing.draft.mood === m ? "bg-amber-100 ring-2 ring-amber-400" : "hover:bg-white/60"}`}
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
