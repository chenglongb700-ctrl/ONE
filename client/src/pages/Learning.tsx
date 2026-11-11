import { useEffect, useMemo, useState, type FormEvent } from "react";
import {
  addDays,
  api,
  fmtMinutes,
  today,
  type LearningItem,
  type LearningKind,
  type LearningLog,
  type LearningStatus,
} from "../api";
import { BookOpen, CalendarClock, ChevronDown, Clock, GraduationCap, Pencil, Pin, Plus, Target, Trash2, Wrench, X, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { AnimatedDiv, AnimatedUl } from "../components/Animated";

const KINDS: Record<LearningKind, { label: string; icon: LucideIcon; cls: string; unit: string }> = {
  book: { label: "书", icon: BookOpen, cls: "bg-ink/6 text-slate-600", unit: "章" },
  course: { label: "课程", icon: GraduationCap, cls: "bg-ink/6 text-slate-600", unit: "集" },
  skill: { label: "技能", icon: Wrench, cls: "bg-ink/6 text-slate-600", unit: "%" },
  other: { label: "其他", icon: Pin, cls: "bg-ink/6 text-slate-600", unit: "项" },
};

const STATUSES: Record<LearningStatus, { label: string; cls: string }> = {
  active: { label: "进行中", cls: "bg-brand/12 text-brand" },
  planned: { label: "计划中", cls: "bg-ink/6 text-slate-600" },
  paused: { label: "暂停", cls: "bg-ink/6 text-slate-400" },
  done: { label: "已完成", cls: "bg-emerald-100 text-emerald-700" },
};
const FILTERS: (LearningStatus | "all")[] = ["active", "planned", "paused", "done", "all"];

type ItemDraft = Omit<LearningItem, "id" | "total_minutes" | "last_date">;
const emptyItem: ItemDraft = {
  title: "",
  kind: "book",
  status: "active",
  goal: "",
  progress: 0,
  total: null,
  unit: "章",
  target_date: null,
};

type LogDraft = { item: LearningItem; date: string; minutes: number; content: string; progress: number; markDone: boolean };

export default function Learning() {
  const [items, setItems] = useState<LearningItem[]>([]);
  const [logs, setLogs] = useState<LearningLog[]>([]);
  const [filter, setFilter] = useState<LearningStatus | "all">("active");
  const [openLogs, setOpenLogs] = useState<number | null>(null);
  const [editing, setEditing] = useState<{ id?: number; draft: ItemDraft } | null>(null);
  const [logging, setLogging] = useState<LogDraft | null>(null);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([api.get<LearningItem[]>("/learning"), api.get<LearningLog[]>("/learning-logs")]).then(([i, l]) => {
      setItems(i);
      setLogs(l);
    });
  useEffect(() => {
    load();
  }, []);

  // 最近 7 天每天的学习分钟数
  const t0 = today();
  const week = useMemo(() => {
    const days = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));
    return days.map((d) => ({ date: d, minutes: logs.filter((l) => l.date === d).reduce((s, l) => s + l.minutes, 0) }));
  }, [logs, t0]);
  const weekTotal = week.reduce((s, d) => s + d.minutes, 0);
  const weekMax = Math.max(60, ...week.map((d) => d.minutes));

  const counts = useMemo(() => {
    const c: Record<string, number> = { all: items.length };
    items.forEach((i) => (c[i.status] = (c[i.status] ?? 0) + 1));
    return c;
  }, [items]);
  const shown = filter === "all" ? items : items.filter((i) => i.status === filter);

  // ---------- 学习项目 增 / 改 / 删 ----------
  const saveItem = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      if (editing.id) await api.put(`/learning/${editing.id}`, editing.draft);
      else await api.post("/learning", editing.draft);
      toast.success(editing.id ? "已保存修改" : "学习项目已创建");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeItem = async (it: LearningItem) => {
    const n = logs.filter((l) => l.item_id === it.id).length;
    if (!(await confirmDialog({ title: "删除学习项目？", message: `「${it.title}」${n ? `和它的 ${n} 条学习日志` : ""}会被删除，无法恢复。` }))) return;
    try {
      await api.del(`/learning/${it.id}`);
      toast.success("学习项目已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const setItem = <K extends keyof ItemDraft>(k: K, v: ItemDraft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  // ---------- 记录一次学习 ----------
  const openLog = (item: LearningItem) => {
    setError("");
    setLogging({ item, date: t0, minutes: 30, content: "", progress: item.progress, markDone: false });
  };

  const saveLog = async (e: FormEvent) => {
    e.preventDefault();
    if (!logging) return;
    setError("");
    const { item } = logging;
    try {
      await api.post("/learning-logs", { item_id: item.id, date: logging.date, minutes: logging.minutes, content: logging.content });
      const patch: Partial<ItemDraft> = {};
      if (item.total !== null && logging.progress !== item.progress) patch.progress = logging.progress;
      if (logging.markDone) patch.status = "done";
      else if (item.status === "planned") patch.status = "active"; // 开始学了，自动从"计划中"变成"进行中"
      if (Object.keys(patch).length) await api.put(`/learning/${item.id}`, patch);
      if (logging.markDone) toast.success(`学完了「${item.title}」，了不起！`);
      else toast.success(`记下 ${fmtMinutes(logging.minutes)} 学习`);
      setLogging(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const removeLog = async (l: LearningLog) => {
    if (!(await confirmDialog({ title: "删除这条学习日志？", message: `${l.date} · ${fmtMinutes(l.minutes)}${l.content ? ` · ${l.content.slice(0, 40)}` : ""}` }))) return;
    try {
      await api.del(`/learning-logs/${l.id}`);
      toast.success("日志已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  return (
    <div>
      <PageHeader
        title="学习"
        sub="书、课程、技能，记录每一次投入"
        action={
          <button className="btn-primary" onClick={() => { setError(""); setEditing({ draft: { ...emptyItem } }); }}>
            <Plus className="size-4" /> 新学习项目
          </button>
        }
      />

      {/* 最近 7 天 */}
      <section className="card mb-4">
        <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
          <h2 className="text-sm font-semibold">最近 7 天</h2>
          <span className="text-sm text-slate-500">
            共 <b className="font-medium text-ink">{fmtMinutes(weekTotal)}</b>
          </span>
        </div>
        <div className="flex items-end gap-2">
          {week.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1" title={`${d.date}：${fmtMinutes(d.minutes)}`}>
              <span className="h-4 text-[10px] tabular-nums text-slate-500">{d.minutes || ""}</span>
              <div className="flex h-20 w-full max-w-10 items-end rounded-md bg-ink/5">
                <div
                  className={`w-full rounded-md ${d.date === t0 ? "bg-brand" : "bg-brand/35"}`}
                  style={{ height: `${(d.minutes / weekMax) * 100}%`, minHeight: d.minutes ? 4 : 0 }}
                />
              </div>
              <span className={`text-xs ${d.date === t0 ? "font-semibold text-brand" : "text-slate-500"}`}>
                {d.date === t0 ? "今天" : "一二三四五六日"[(new Date(d.date + "T12:00").getDay() + 6) % 7]}
              </span>
            </div>
          ))}
        </div>
      </section>

      {/* 状态筛选 */}
      <div className="mb-4 flex flex-wrap gap-2">
        {FILTERS.map((f) => (
          <button
            key={f}
            onClick={() => setFilter(f)}
            className={filter === f ? "chip-on" : "chip"}
          >
            {f === "all" ? "全部" : STATUSES[f].label} {counts[f] ?? 0}
          </button>
        ))}
      </div>

      {shown.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          {items.length ? "这个分类下还没有学习项目" : "还没有学习项目。添加一本正在读的书，或一门正在上的课吧"}
        </div>
      ) : (
        <AnimatedDiv className="grid gap-4 md:grid-cols-2">
          {shown.map((it) => {
            const pct = it.total ? Math.min(100, (it.progress / it.total) * 100) : null;
            const late = it.status !== "done" && it.target_date && it.target_date < t0;
            const itemLogs = logs.filter((l) => l.item_id === it.id);
            return (
              <article key={it.id} className="card flex flex-col gap-3">
                <div className="flex items-start gap-3">
                  {(() => {
                    const K = KINDS[it.kind];
                    return (
                      <span className={`grid size-9 shrink-0 place-items-center rounded-lg ${K.cls}`} title={K.label}>
                        <K.icon className="size-[18px]" />
                      </span>
                    );
                  })()}
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold">{it.title}</h3>
                      <span className={`rounded-md px-1.5 py-0.5 text-xs ${STATUSES[it.status].cls}`}>{STATUSES[it.status].label}</span>
                    </div>
                    {it.goal && <p className="mt-1 text-sm text-slate-500">{it.goal}</p>}
                  </div>
                </div>

                {pct !== null && (
                  <div>
                    <div className="mb-1 flex justify-between text-xs text-slate-500">
                      <span className="tabular-nums">
                        {it.progress} / {it.total} {it.unit}
                      </span>
                      <span className="tabular-nums">{pct.toFixed(0)}%</span>
                    </div>
                    <div className="h-1.5 rounded-full bg-ink/8">
                      <div className={`h-1.5 rounded-full ${it.status === "done" ? "bg-emerald-500" : "bg-brand"}`} style={{ width: `${pct}%` }} />
                    </div>
                  </div>
                )}

                <div className="flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-500">
                  <span className="flex items-center gap-1"><Clock className="size-3.5" />累计 {fmtMinutes(it.total_minutes)}</span>
                  {it.last_date && <span className="flex items-center gap-1"><CalendarClock className="size-3.5" />最近 {it.last_date === t0 ? "今天" : it.last_date}</span>}
                  {it.target_date && (
                    <span className={`flex items-center gap-1 ${late ? "font-medium text-red-600" : ""}`}>
                      <Target className="size-3.5" />
                      {it.target_date}
                      {late && " 已超期"}
                    </span>
                  )}
                </div>

                <div className="flex flex-wrap items-center gap-1">
                  {it.status !== "done" && (
                    <button className="btn-primary px-2.5 py-1 text-xs" onClick={() => openLog(it)}>
                      <Plus className="size-3.5" /> 记录学习
                    </button>
                  )}
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setOpenLogs(openLogs === it.id ? null : it.id)} aria-expanded={openLogs === it.id}>
                    日志 {itemLogs.length}
                    <ChevronDown className={`size-3.5 transition ${openLogs === it.id ? "rotate-180" : ""}`} />
                  </button>
                  <button className="btn-ghost ml-auto p-1.5" title="编辑" aria-label="编辑" onClick={() => { setError(""); setEditing({ id: it.id, draft: { ...it } }); }}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button className="btn-danger p-1.5" title="删除" aria-label="删除" onClick={() => removeItem(it)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>

                {openLogs === it.id && (
                  <AnimatedUl className="divide-y divide-line rounded-xl bg-ink/[0.04] text-sm">
                    {itemLogs.length === 0 && <li key="empty" className="p-3 text-center text-xs text-slate-400">还没有学习记录</li>}
                    {itemLogs.map((l) => (
                      <li key={l.id} className="group flex items-start gap-3 px-3 py-2">
                        <span className="w-20 shrink-0 text-xs tabular-nums text-slate-500">{l.date}</span>
                        <span className="min-w-0 flex-1 whitespace-pre-wrap">{l.content || <span className="text-slate-400">（无备注）</span>}</span>
                        <span className="shrink-0 text-xs tabular-nums text-brand">{fmtMinutes(l.minutes)}</span>
                        <button className="btn-danger shrink-0 p-1 md:opacity-0 md:group-hover:opacity-100" title="删除日志" aria-label="删除日志" onClick={() => removeLog(l)}>
                          <X className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </AnimatedUl>
                )}
              </article>
            );
          })}
        </AnimatedDiv>
      )}

      {/* 新建 / 编辑学习项目 */}
      {editing && (
        <Modal title={editing.id ? "编辑学习项目" : "新学习项目"} onClose={() => setEditing(null)}>
          <form onSubmit={saveItem} className="space-y-3">
            <div>
              <label className="label">名称</label>
              <input className="input" value={editing.draft.title} onChange={(e) => setItem("title", e.target.value)} placeholder="例如：《数据密集型应用系统设计》" autoFocus />
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">类型</label>
                <select
                  className="input"
                  value={editing.draft.kind}
                  onChange={(e) => {
                    const kind = e.target.value as LearningKind;
                    setEditing((ed) => ed && { ...ed, draft: { ...ed.draft, kind, unit: ed.id ? ed.draft.unit : KINDS[kind].unit } });
                  }}
                >
                  {Object.entries(KINDS).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
              <div>
                <label className="label">状态</label>
                <select className="input" value={editing.draft.status} onChange={(e) => setItem("status", e.target.value as LearningStatus)}>
                  {Object.entries(STATUSES).map(([k, v]) => (
                    <option key={k} value={k}>{v.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div>
              <label className="label">目标 / 为什么学</label>
              <textarea className="input min-h-16" value={editing.draft.goal} onChange={(e) => setItem("goal", e.target.value)} placeholder="例如：搞懂分布式系统的基本原理" />
            </div>
            <div className="grid grid-cols-3 gap-3">
              <div>
                <label className="label">当前进度</label>
                <input className="input" type="number" min="0" step="any" value={editing.draft.progress} onChange={(e) => setItem("progress", Number(e.target.value))} />
              </div>
              <div>
                <label className="label">总量（可空）</label>
                <input className="input" type="number" min="0" step="any" value={editing.draft.total ?? ""} onChange={(e) => setItem("total", e.target.value ? Number(e.target.value) : null)} placeholder="不按进度" />
              </div>
              <div>
                <label className="label">单位</label>
                <input className="input" value={editing.draft.unit} onChange={(e) => setItem("unit", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">计划完成日期</label>
              <input className="input" type="date" value={editing.draft.target_date ?? ""} onChange={(e) => setItem("target_date", e.target.value || null)} />
            </div>
            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn-primary">保存</button>
            </div>
          </form>
        </Modal>
      )}

      {/* 记录学习 */}
      {logging && (
        <Modal title={`记录学习 · ${logging.item.title}`} onClose={() => setLogging(null)}>
          <form onSubmit={saveLog} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">日期</label>
                <input className="input" type="date" value={logging.date} onChange={(e) => setLogging({ ...logging, date: e.target.value })} />
              </div>
              <div>
                <label className="label">时长（分钟）</label>
                <input className="input" type="number" min="0" value={logging.minutes} onChange={(e) => setLogging({ ...logging, minutes: Number(e.target.value) })} />
              </div>
            </div>
            <div className="flex flex-wrap gap-1">
              {[15, 30, 45, 60, 90, 120].map((m) => (
                <button
                  type="button"
                  key={m}
                  onClick={() => setLogging({ ...logging, minutes: m })}
                  className={`rounded-md px-2.5 py-1 text-xs transition ${logging.minutes === m ? "bg-ink text-paper" : "bg-ink/6 text-slate-600 hover:bg-ink/10"}`}
                >
                  {m < 60 ? `${m} 分` : `${m / 60} 小时`}
                </button>
              ))}
            </div>
            <div>
              <label className="label">学了什么</label>
              <textarea className="input min-h-24" value={logging.content} onChange={(e) => setLogging({ ...logging, content: e.target.value })} placeholder="例如：读完第 3 章，理解了 LSM-Tree 和 B-Tree 的区别" autoFocus />
            </div>
            {logging.item.total !== null && (
              <div>
                <label className="label">进度更新到（共 {logging.item.total} {logging.item.unit}）</label>
                <input
                  className="input"
                  type="number"
                  min="0"
                  step="any"
                  value={logging.progress}
                  onChange={(e) => {
                    const p = Number(e.target.value);
                    setLogging({ ...logging, progress: p, markDone: p >= (logging.item.total ?? Infinity) });
                  }}
                />
              </div>
            )}
            <label className="flex items-center gap-2 text-sm">
              <input type="checkbox" className="size-4 accent-brand" checked={logging.markDone} onChange={(e) => setLogging({ ...logging, markDone: e.target.checked })} />
              这次学完了，标记为已完成
            </label>
            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setLogging(null)}>取消</button>
              <button className="btn-primary">保存</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
