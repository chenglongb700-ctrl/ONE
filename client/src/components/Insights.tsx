import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { api } from "../api";

/**
 * 总览页上的三张图：最近的任务完成情况、每天的记录热力图（放在左栏今日事项下面）、随记里的心情（放在右栏最下面）。
 * 三张图都只用一种颜色（强调色）的深浅来表示多少，不靠颜色区分类别；
 * 鼠标移到（或手指点到）某一格、某一根柱子上，卡片右上角会显示它的具体数字。
 */
export type Charts = {
  taskDays: { date: string; done: number }[];
  taskStatus: { todo: number; doing: number; done: number };
  activity: { date: string; tasks: number; expenses: number; journals: number }[];
  moods: { mood: string; n: number }[];
};

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
/** 强调色的几档深浅：数值越大越实 */
const shade = (pct: number) => `color-mix(in oklab, var(--brand) ${pct}%, transparent)`;

/** 一张图的外框：标题、右上角的读数（没指着任何东西时显示 hint）、去对应页面的链接 */
function Panel({ title, readout, hint, to, children }: { title: string; readout: string; hint: string; to: string; children: ReactNode }) {
  return (
    <section className="card flex min-w-0 flex-col px-5">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h2 className="shrink-0 text-sm font-medium">
          <Link to={to} className="underline-offset-4 hover:underline">
            {title}
          </Link>
        </h2>
        <span className={`min-w-0 truncate text-xs tabular-nums ${readout ? "text-ink" : "text-slate-500"}`} aria-live="polite">
          {readout || hint}
        </span>
      </div>
      {children}
    </section>
  );
}

/** 最近 14 天每天完成了几个任务（柱状图），下面一条现在各状态的比例 */
export function TaskChart({ days, status }: { days: Charts["taskDays"]; status: Charts["taskStatus"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const max = Math.max(1, ...days.map((d) => d.done));
  const total = days.reduce((n, d) => n + d.done, 0);
  const all = status.todo + status.doing + status.done;
  const parts = [
    { label: "待办", n: status.todo, pct: 30 },
    { label: "进行中", n: status.doing, pct: 60 },
    { label: "已完成", n: status.done, pct: 100 },
  ];
  return (
    <Panel title="任务完成" to="/work" hint={`近 14 天完成 ${total} 个`} readout={hover === null ? "" : `${md(days[hover].date)} 完成 ${days[hover].done} 个`}>
      <div className="flex h-28 items-end gap-[3px]" role="img" aria-label={`最近 14 天每天完成的任务数，共 ${total} 个`} onMouseLeave={() => setHover(null)}>
        {days.map((d, i) => (
          // 整列都是感应区，比柱子本身好指
          <button key={d.date} type="button" className="group flex h-full min-w-0 flex-1 cursor-default flex-col justify-end outline-offset-1" onMouseEnter={() => setHover(i)} onFocus={() => setHover(i)} onBlur={() => setHover(null)} onClick={() => setHover(i)} aria-label={`${md(d.date)} 完成 ${d.done} 个`}>
            <span
              className="block w-full rounded-t-[4px] transition-[filter] group-hover:brightness-110"
              style={{ height: d.done ? `${Math.max(8, (d.done / max) * 100)}%` : "2px", background: d.done ? shade(hover === i ? 100 : 80) : "var(--line)" }}
            />
          </button>
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>{md(days[0].date)}</span>
        <span>今天</span>
      </div>

      {/* 现在的任务：待办 → 进行中 → 已完成，同一种颜色由浅到深 */}
      <div className="mt-auto pt-4">
        {all === 0 ? (
          <p className="text-xs text-slate-500">还没有任务。</p>
        ) : (
          <>
            <div className="flex h-2 gap-[2px] overflow-hidden rounded-full" role="img" aria-label={parts.map((p) => `${p.label} ${p.n} 个`).join("，")}>
              {parts.filter((p) => p.n > 0).map((p) => (
                <span key={p.label} style={{ flexGrow: p.n, background: shade(p.pct) }} />
              ))}
            </div>
            <div className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600">
              {parts.map((p) => (
                <span key={p.label} className="flex items-center gap-1.5">
                  <span className="size-2 rounded-[3px]" style={{ background: shade(p.pct) }} aria-hidden />
                  {p.label} <span className="tabular-nums text-ink">{p.n}</span>
                </span>
              ))}
            </div>
          </>
        )}
      </div>
    </Panel>
  );
}

/** 最近 17 周每天记了多少条东西：一列是一周（周一在上），颜色越实记得越多 */
export function ActivityChart({ days }: { days: Charts["activity"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const sum = (d: Charts["activity"][number]) => d.tasks + d.expenses + d.journals;
  const max = Math.max(1, ...days.map(sum));
  const activeDays = days.filter((d) => sum(d) > 0).length;
  // 0 条是空格子；有记录的按占最多那天的比例分四档
  const level = (n: number) => (n === 0 ? 0 : Math.min(4, Math.ceil((n / max) * 4)));
  const fill = ["color-mix(in oklab, var(--ink) 8%, transparent)", shade(28), shade(50), shade(75), shade(100)];
  const weeks = Array.from({ length: Math.ceil(days.length / 7) }, (_, w) => days.slice(w * 7, w * 7 + 7));
  const h = hover === null ? null : days[hover];
  const detail = (d: Charts["activity"][number]) =>
    sum(d) === 0 ? "没有记录" : [d.tasks && `完成任务 ${d.tasks}`, d.expenses && `记账 ${d.expenses}`, d.journals && `随记 ${d.journals}`].filter(Boolean).join("，");
  return (
    <Panel title="每天的记录" to="/journal" hint={`近 ${weeks.length} 周有 ${activeDays} 天记了东西`} readout={h ? `${md(h.date)} ${detail(h)}` : ""}>
      <div className="flex gap-[3px]" onMouseLeave={() => setHover(null)}>
        <div className="flex shrink-0 flex-col justify-between py-px pr-1 text-[11px] leading-none text-slate-500" aria-hidden>
          <span>一</span>
          <span>四</span>
          <span>日</span>
        </div>
        {weeks.map((week, w) => (
          <div key={w} className="flex min-w-0 flex-1 flex-col gap-[3px]">
            {week.map((d, i) => (
              <button
                key={d.date}
                type="button"
                className="aspect-square w-full cursor-default rounded-[3px] outline-offset-1 transition-[box-shadow] hover:shadow-[0_0_0_1.5px_var(--ink)]"
                style={{ background: fill[level(sum(d))] }}
                onMouseEnter={() => setHover(w * 7 + i)}
                onFocus={() => setHover(w * 7 + i)}
                onBlur={() => setHover(null)}
                onClick={() => setHover(w * 7 + i)}
                aria-label={`${md(d.date)} ${detail(d)}`}
              />
            ))}
          </div>
        ))}
      </div>
      <div className="mt-auto flex items-center justify-between pt-3 text-[11px] text-slate-500">
        <span>{md(days[0].date)} 起</span>
        <span className="flex items-center gap-1" aria-hidden>
          少
          {fill.map((f) => (
            <span key={f} className="size-2.5 rounded-[3px]" style={{ background: f }} />
          ))}
          多
        </span>
      </div>
    </Panel>
  );
}

/** 最近 30 天的随记里，各种心情各出现了几次（横向条，从多到少） */
export function MoodChart({ moods }: { moods: Charts["moods"] }) {
  const [hover, setHover] = useState<number | null>(null);
  const total = moods.reduce((n, m) => n + m.n, 0);
  const max = Math.max(1, ...moods.map((m) => m.n));
  return (
    <Panel title="随记里的心情" to="/journal" hint={total ? `近 30 天 ${total} 篇` : "近 30 天"} readout={hover === null ? "" : `${moods[hover].mood} ${moods[hover].n} 篇，占 ${Math.round((moods[hover].n / total) * 100)}%`}>
      {total === 0 ? (
        <p className="py-6 text-center text-sm text-slate-400">
          这 30 天还没有写随记。
          <Link to="/journal" className="underline underline-offset-4 hover:text-ink">
            写一篇
          </Link>
        </p>
      ) : (
        <ul className="space-y-1.5" onMouseLeave={() => setHover(null)}>
          {moods.map((m, i) => (
            <li key={m.mood} className="flex items-center gap-2.5 text-sm" onMouseEnter={() => setHover(i)} onClick={() => setHover(i)}>
              <span className="w-6 shrink-0 text-center text-base leading-none">{m.mood}</span>
              <span className="h-3.5 min-w-0 flex-1">
                <span className="block h-full rounded-r-[4px] transition-[background]" style={{ width: `${Math.max(3, (m.n / max) * 100)}%`, background: shade(hover === i ? 100 : 78) }} />
              </span>
              <span className="w-6 shrink-0 text-right text-xs tabular-nums text-slate-600">{m.n}</span>
            </li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

/** 读三张图的数据。null = 还在读或者没读到（没读到就不显示图，不影响页面上别的内容） */
export function useCharts(): Charts | null {
  const [data, setData] = useState<Charts | null>(null);
  useEffect(() => {
    api.get<Charts>("/stats/charts").then(setData, () => {});
  }, []);
  return data;
}
