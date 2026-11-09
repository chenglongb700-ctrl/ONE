import { useEffect, useMemo, useState, type FormEvent } from "react";
import { addDays, api, today, weekdayIndex, type Habit, type HabitCheck, type HabitColor } from "../api";
import { Archive, Check, ChevronDown, CircleCheckBig, Flame, Pencil, Plus, RotateCcw, Trash2 } from "lucide-react";
import { toast } from "sonner";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";

// Tailwind 只会生成源码里完整出现过的类名，所以颜色要写成完整字符串
export const COLORS: Record<HabitColor, { name: string; dot: string; ring: string; levels: [string, string, string, string] }> = {
  emerald: { name: "绿", dot: "bg-emerald-500", ring: "ring-emerald-500", levels: ["bg-emerald-200", "bg-emerald-300", "bg-emerald-500", "bg-emerald-700"] },
  sky: { name: "蓝", dot: "bg-sky-500", ring: "ring-sky-500", levels: ["bg-sky-200", "bg-sky-300", "bg-sky-500", "bg-sky-700"] },
  indigo: { name: "靛", dot: "bg-indigo-500", ring: "ring-indigo-500", levels: ["bg-indigo-200", "bg-indigo-300", "bg-indigo-500", "bg-indigo-700"] },
  amber: { name: "橙", dot: "bg-amber-500", ring: "ring-amber-500", levels: ["bg-amber-200", "bg-amber-300", "bg-amber-500", "bg-amber-700"] },
  rose: { name: "红", dot: "bg-rose-500", ring: "ring-rose-500", levels: ["bg-rose-200", "bg-rose-300", "bg-rose-500", "bg-rose-700"] },
  violet: { name: "紫", dot: "bg-violet-500", ring: "ring-violet-500", levels: ["bg-violet-200", "bg-violet-300", "bg-violet-500", "bg-violet-700"] },
};
const ICONS = ["✅", "📖", "🏃", "💪", "🧘", "💧", "😴", "🇬🇧", "✍️", "🥗", "🚭", "🎸", "💻", "🧹"];
const WEEK = "一二三四五六日";

/**
 * 计算连续打卡天数
 * current：从今天往回数；今天还没打卡不算断，从昨天开始数
 * longest：已加载范围内最长的一段
 */
export function streaks(dates: Set<string>, t0: string) {
  let current = 0;
  let d = dates.has(t0) ? t0 : addDays(t0, -1);
  while (dates.has(d)) {
    current++;
    d = addDays(d, -1);
  }
  let longest = 0;
  let run = 0;
  let prev = "";
  for (const x of [...dates].sort()) {
    run = prev && addDays(prev, 1) === x ? run + 1 : 1;
    longest = Math.max(longest, run);
    prev = x;
  }
  return { current, longest };
}

type Draft = { name: string; icon: string; color: HabitColor };

export default function Habits() {
  const t0 = today();
  // 热力图显示 53 周，从 52 周前的周一开始
  const heatStart = addDays(t0, -weekdayIndex(t0) - 52 * 7);

  const [habits, setHabits] = useState<Habit[]>([]);
  const [checks, setChecks] = useState<HabitCheck[]>([]);
  const [focus, setFocus] = useState<number | "all">("all");
  const [editing, setEditing] = useState<{ id?: number; draft: Draft } | null>(null);
  const [showArchived, setShowArchived] = useState(false);
  const [error, setError] = useState("");

  const load = () =>
    Promise.all([api.get<Habit[]>("/habits"), api.get<HabitCheck[]>(`/habits/checks?from=${heatStart}&to=${t0}`)]).then(([h, c]) => {
      setHabits(h);
      setChecks(c);
    });
  useEffect(() => {
    load();
  }, []);

  const active = habits.filter((h) => !h.archived);
  const archived = habits.filter((h) => h.archived);

  // habit_id → 打卡日期集合
  const byHabit = useMemo(() => {
    const m = new Map<number, Set<string>>();
    checks.forEach((c) => {
      if (!m.has(c.habit_id)) m.set(c.habit_id, new Set());
      m.get(c.habit_id)!.add(c.date);
    });
    return m;
  }, [checks]);
  const datesOf = (id: number) => byHabit.get(id) ?? new Set<string>();

  const last7 = Array.from({ length: 7 }, (_, i) => addDays(t0, i - 6));
  const yearPrefix = t0.slice(0, 4);

  // 乐观更新：先改界面，再请求后端；失败就重新加载
  const toggle = async (h: Habit, date: string) => {
    const has = datesOf(h.id).has(date);
    setChecks((cs) => (has ? cs.filter((c) => !(c.habit_id === h.id && c.date === date)) : [...cs, { habit_id: h.id, date }]));
    try {
      await api.post(`/habits/${h.id}/toggle`, { date });
      if (!has && date === t0) {
        const s = streaks(new Set([...datesOf(h.id), date]), t0);
        if (s.current >= 3) toast.success(`${h.name}：已连续 ${s.current} 天`, { icon: <Flame className="size-4 text-orange-500" /> });
      }
    } catch (err) {
      toast.error((err as Error).message);
      load();
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      if (editing.id) await api.put(`/habits/${editing.id}`, editing.draft);
      else await api.post("/habits", editing.draft);
      toast.success(editing.id ? "习惯已更新" : "新习惯已添加，从今天开始吧");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const setArchived = async (h: Habit, value: boolean) => {
    try {
      await api.put(`/habits/${h.id}`, { archived: value });
      toast.success(value ? `已归档「${h.name}」，打卡记录会保留` : `已恢复「${h.name}」`);
    } catch (err) {
      toast.error((err as Error).message);
    }
    if (focus === h.id) setFocus("all");
    load();
  };

  const remove = async (h: Habit) => {
    const ok = await confirmDialog({
      title: "永久删除这个习惯？",
      message: `「${h.name}」和它的全部打卡记录都会被删除，无法恢复。只想暂时不用的话，保留归档就好。`,
      confirmText: "永久删除",
    });
    if (!ok) return;
    try {
      await api.del(`/habits/${h.id}`);
      toast.success("习惯已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  // ---------- 热力图数据 ----------
  const heat = useMemo(() => {
    const focusHabit = focus === "all" ? null : habits.find((h) => h.id === focus) ?? null;
    const color = focusHabit ? COLORS[focusHabit.color] : COLORS.emerald;
    const counts = new Map<string, number>();
    checks.forEach((c) => {
      if (focusHabit ? c.habit_id === focusHabit.id : active.some((h) => h.id === c.habit_id)) {
        counts.set(c.date, (counts.get(c.date) ?? 0) + 1);
      }
    });
    const denom = focusHabit ? 1 : Math.max(1, active.length);
    const weeks: { date: string; count: number; level: number }[][] = [];
    for (let w = 0; w < 53; w++) {
      const col = [];
      for (let d = 0; d < 7; d++) {
        const date = addDays(heatStart, w * 7 + d);
        const count = counts.get(date) ?? 0;
        // 0 表示没打卡；1-4 按完成比例分级
        const level = count === 0 ? 0 : Math.min(4, Math.ceil((count / denom) * 4));
        col.push({ date, count, level });
      }
      weeks.push(col);
    }
    const total = [...counts.values()].reduce((s, n) => s + n, 0);
    return { weeks, color, total, denom };
  }, [checks, focus, habits, heatStart]);

  return (
    <div>
      <PageHeader
        title="习惯"
        icon={CircleCheckBig}
        tone="bg-rose-500"
        sub="每天一点点，看得见的坚持"
        action={
          <button className="btn-primary" onClick={() => { setError(""); setEditing({ draft: { name: "", icon: "✅", color: "emerald" } }); }}>
            <Plus className="size-4" /> 新习惯
          </button>
        }
      />

      {/* 最近 7 天打卡 */}
      <section className="card mb-4 overflow-x-auto p-0">
        {active.length === 0 ? (
          <p className="p-8 text-center text-sm text-slate-400">还没有习惯。比如"读书 30 分钟""运动""23 点前睡觉"，从一个开始就好</p>
        ) : (
          <table className="w-full min-w-[640px] text-sm">
            <thead>
              <tr className="text-xs text-slate-500">
                <th className="px-4 py-3 text-left font-medium">习惯</th>
                {last7.map((d) => (
                  <th key={d} className={`w-11 py-3 text-center font-medium ${d === t0 ? "text-slate-900" : ""}`}>
                    <div>{d === t0 ? "今天" : WEEK[weekdayIndex(d)]}</div>
                    <div className="text-[10px] font-normal tabular-nums text-slate-400">{d.slice(5)}</div>
                  </th>
                ))}
                <th className="px-3 py-3 text-right font-medium">连续</th>
                <th className="px-3 py-3 text-right font-medium">最长</th>
                <th className="px-3 py-3 text-right font-medium">{yearPrefix} 年</th>
                <th className="w-10" />
              </tr>
            </thead>
            <tbody className="divide-y divide-white/60">
              {active.map((h) => {
                const dates = datesOf(h.id);
                const s = streaks(dates, t0);
                const yearCount = [...dates].filter((d) => d.startsWith(yearPrefix)).length;
                const c = COLORS[h.color];
                return (
                  <tr key={h.id} className="group">
                    <td className="px-4 py-2.5">
                      <button className="flex items-center gap-2 text-left hover:underline" onClick={() => setFocus(h.id)} title="在热力图中查看">
                        <span className="text-lg">{h.icon}</span>
                        <span className="font-medium">{h.name}</span>
                      </button>
                    </td>
                    {last7.map((d) => {
                      const on = dates.has(d);
                      return (
                        <td key={d} className="py-2.5 text-center">
                          <button
                            onClick={() => toggle(h, d)}
                            aria-label={`${h.name} ${d} ${on ? "已打卡，点击取消" : "未打卡，点击打卡"}`}
                            className={`mx-auto grid size-8 place-items-center rounded-full text-white transition active:scale-90 ${
                              on ? `${c.dot} shadow-sm` : `bg-white/50 ring-1 ring-inset ring-slate-300/70 hover:bg-white/80 ${d === t0 ? `ring-2 ${c.ring}` : ""}`
                            }`}
                          >
                            {on && <Check className="size-4" strokeWidth={3} />}
                          </button>
                        </td>
                      );
                    })}
                    <td className="px-3 py-2.5 text-right tabular-nums">
                      {s.current > 0 ? (
                        <span className="inline-flex items-center gap-1 font-semibold">
                          <Flame className="size-4 text-orange-500" />
                          {s.current}
                        </span>
                      ) : (
                        <span className="text-slate-400">0</span>
                      )}
                    </td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{s.longest}</td>
                    <td className="px-3 py-2.5 text-right tabular-nums text-slate-500">{yearCount}</td>
                    <td className="pr-3 text-right">
                      <button
                        className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100"
                        title="编辑"
                        aria-label={`编辑 ${h.name}`}
                        onClick={() => { setError(""); setEditing({ id: h.id, draft: { name: h.name, icon: h.icon, color: h.color } }); }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        )}
      </section>

      {/* 年度热力图 */}
      {active.length > 0 && (
        <section className="card mb-4">
          <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
            <h2 className="text-sm font-semibold">
              近一年 · {focus === "all" ? "全部习惯" : habits.find((h) => h.id === focus)?.name}
              <span className="ml-2 font-normal text-slate-500">共打卡 {heat.total} 次</span>
            </h2>
            <div className="flex flex-wrap gap-1.5">
              {[{ id: "all" as const, label: "全部" }, ...active.map((h) => ({ id: h.id, label: `${h.icon} ${h.name}` }))].map((o) => (
                <button
                  key={o.id}
                  onClick={() => setFocus(o.id)}
                  className={`rounded-full px-2.5 py-0.5 text-xs transition ${focus === o.id ? "bg-slate-800 text-white" : "bg-white/50 text-slate-600 ring-1 ring-white/70 hover:bg-white/70"}`}
                >
                  {o.label}
                </button>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto pb-1">
            <div className="inline-flex gap-[3px]">
              <div className="mr-1 flex flex-col gap-[3px] pt-4 text-[10px] leading-[11px] text-slate-400">
                {[...WEEK].map((w, i) => (
                  <span key={w} className="h-[11px]">{i % 2 === 0 ? w : ""}</span>
                ))}
              </div>
              {heat.weeks.map((col, wi) => {
                const first = col[0].date;
                const showMonth = wi === 0 || first.slice(5, 7) !== heat.weeks[wi - 1][0].date.slice(5, 7);
                return (
                  <div key={first} className="flex flex-col gap-[3px]">
                    <span className="h-[13px] whitespace-nowrap text-[10px] leading-[13px] text-slate-400">
                      {showMonth ? `${Number(first.slice(5, 7))}月` : ""}
                    </span>
                    {col.map((cell) =>
                      cell.date > t0 ? (
                        <span key={cell.date} className="size-[11px]" />
                      ) : (
                        <span
                          key={cell.date}
                          title={`${cell.date}：${focus === "all" ? `${cell.count}/${heat.denom} 个习惯` : cell.count ? "已打卡" : "未打卡"}`}
                          className={`size-[11px] rounded-[3px] ${cell.level === 0 ? "bg-slate-300/40" : heat.color.levels[cell.level - 1]} ${cell.date === t0 ? "ring-1 ring-slate-500" : ""}`}
                        />
                      ),
                    )}
                  </div>
                );
              })}
            </div>
          </div>
          <div className="mt-2 flex items-center justify-end gap-1 text-[10px] text-slate-400">
            少
            <span className="size-[11px] rounded-[3px] bg-slate-300/40" />
            {heat.color.levels.map((l) => (
              <span key={l} className={`size-[11px] rounded-[3px] ${l}`} />
            ))}
            多
          </div>
        </section>
      )}

      {/* 已归档 */}
      {archived.length > 0 && (
        <section>
          <button className="btn-ghost text-xs" onClick={() => setShowArchived(!showArchived)} aria-expanded={showArchived}>
            <Archive className="size-3.5" /> 已归档 {archived.length} 个
            <ChevronDown className={`size-3.5 transition ${showArchived ? "rotate-180" : ""}`} />
          </button>
          {showArchived && (
            <ul className="card mt-2 divide-y divide-white/60 p-0">
              {archived.map((h) => (
                <li key={h.id} className="flex items-center gap-3 px-4 py-2.5 text-sm">
                  <span className="text-lg">{h.icon}</span>
                  <span className="flex-1 text-slate-600">{h.name}</span>
                  <span className="text-xs text-slate-400">共 {datesOf(h.id).size} 次（近一年）</span>
                  <button className="btn-ghost px-2 py-1 text-xs" onClick={() => setArchived(h, false)}><RotateCcw className="size-3.5" /> 恢复</button>
                  <button className="btn-danger px-2 py-1 text-xs" onClick={() => remove(h)}><Trash2 className="size-3.5" /> 删除</button>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {editing && (
        <Modal title={editing.id ? "编辑习惯" : "新习惯"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-4">
            <div>
              <label className="label">名称</label>
              <input className="input" value={editing.draft.name} onChange={(e) => setEditing({ ...editing, draft: { ...editing.draft, name: e.target.value } })} placeholder="例如：读书 30 分钟" autoFocus />
            </div>
            <div>
              <label className="label">图标</label>
              <div className="flex flex-wrap gap-1">
                {ICONS.map((i) => (
                  <button
                    type="button"
                    key={i}
                    onClick={() => setEditing({ ...editing, draft: { ...editing.draft, icon: i } })}
                    className={`rounded-lg p-1.5 text-xl transition ${editing.draft.icon === i ? "bg-white/90 ring-2 ring-slate-400" : "hover:bg-white/60"}`}
                  >
                    {i}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="label">颜色</label>
              <div className="flex gap-2">
                {(Object.keys(COLORS) as HabitColor[]).map((c) => (
                  <button
                    type="button"
                    key={c}
                    aria-label={COLORS[c].name}
                    onClick={() => setEditing({ ...editing, draft: { ...editing.draft, color: c } })}
                    className={`size-7 rounded-full ${COLORS[c].dot} transition ${editing.draft.color === c ? "ring-2 ring-slate-700 ring-offset-2" : "opacity-70 hover:opacity-100"}`}
                  />
                ))}
              </div>
            </div>
            <ErrorText msg={error} />
            <div className="flex items-center justify-end gap-2 pt-2">
              {editing.id && (
                <button
                  type="button"
                  className="btn-ghost mr-auto"
                  onClick={() => {
                    const h = habits.find((x) => x.id === editing.id)!;
                    setEditing(null);
                    setArchived(h, true);
                  }}
                >
                  <Archive className="size-4" /> 归档
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>取消</button>
              <button className="btn-primary">保存</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
