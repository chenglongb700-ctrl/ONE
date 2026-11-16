import { useEffect, useRef, useState, type ReactNode } from "react";

/**
 * 健身页面用的两种图：折线图（体重、力量进步）和柱状图（每天摄入、每周运动）。
 * 和总览页的图一个做法：只用强调色，鼠标移上去（或手指点一下）在卡片右上角显示那一点的数字。
 */
const shade = (pct: number) => `color-mix(in oklab, var(--brand) ${pct}%, transparent)`;
export const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;

/** 一张图的外框：标题、右上角的读数（没指着任何东西时显示 hint）、可选的操作（切换时间范围之类） */
export function ChartCard({ title, readout, hint, action, children }: { title: string; readout?: string; hint?: string; action?: ReactNode; children: ReactNode }) {
  return (
    <section className="card min-w-0 px-5">
      <div className="mb-3 flex flex-wrap items-center gap-x-3 gap-y-1">
        <h2 className="shrink-0 text-sm font-medium">{title}</h2>
        {action}
        <span className={`ml-auto min-w-0 truncate text-xs tabular-nums ${readout ? "text-ink" : "text-slate-500"}`} aria-live="polite">
          {readout || hint}
        </span>
      </div>
      {children}
    </section>
  );
}

/** 量出一个元素现在有多宽（图要按实际宽度画，文字才不会被拉变形） */
function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const ro = new ResizeObserver(() => setWidth(el.clientWidth));
    ro.observe(el);
    setWidth(el.clientWidth);
    return () => ro.disconnect();
  }, []);
  return { ref, width };
}

export type Point = { date: string; value: number };

/**
 * 折线图：横轴是日期（按真实的天数间隔排），纵轴是数值。
 * target 给了的话画一条虚线的目标线。onHover 把鼠标指着的那个点的序号传出去（离开时是 null）。
 */
export function LineChart({ points, target, targetLabel = "目标", unit = "", height = 180, onHover }: { points: Point[]; target?: number; targetLabel?: string; unit?: string; height?: number; onHover: (i: number | null) => void }) {
  const { ref, width } = useWidth<HTMLDivElement>();
  const [active, setActive] = useState<number | null>(null);
  const pad = { l: 40, r: 12, t: 12, b: 22 };

  // 目标线离数据不远时把它也画进来；离得太远的话硬画进来会把曲线压成一条平线，
  // 这时只在角上写一句"目标在图外"，让曲线本身的起伏看得清
  const data = points.map((p) => p.value);
  const dataSpan = Math.max(Math.max(...data) - Math.min(...data), 1);
  const targetShown = target !== undefined && target >= Math.min(...data) - dataSpan * 1.5 && target <= Math.max(...data) + dataSpan * 1.5;
  const values = targetShown ? [...data, target] : data;
  let lo = Math.min(...values);
  let hi = Math.max(...values);
  // 上下各留一点空，全是同一个数时也有个范围
  const span = Math.max(hi - lo, 1);
  lo -= span * 0.12;
  hi += span * 0.12;

  const t = (d: string) => new Date(d + "T12:00:00").getTime();
  const t0 = t(points[0].date);
  const t1 = Math.max(t(points[points.length - 1].date), t0 + 86_400_000);
  const w = Math.max(width, 120);
  const x = (d: string) => pad.l + ((t(d) - t0) / (t1 - t0)) * (w - pad.l - pad.r);
  const y = (v: number) => pad.t + (1 - (v - lo) / (hi - lo)) * (height - pad.t - pad.b);
  const path = points.map((p, i) => `${i ? "L" : "M"}${x(p.date).toFixed(1)},${y(p.value).toFixed(1)}`).join(" ");

  const pick = (clientX: number, box: DOMRect) => {
    const px = clientX - box.left;
    let best = 0;
    for (let i = 1; i < points.length; i++) if (Math.abs(x(points[i].date) - px) < Math.abs(x(points[best].date) - px)) best = i;
    setActive(best);
    onHover(best);
  };
  const leave = () => {
    setActive(null);
    onHover(null);
  };
  const ticks = [hi - (hi - lo) * 0.12, (hi + lo) / 2, lo + (hi - lo) * 0.12];
  const fmt = (v: number) => (Math.abs(v) >= 100 ? v.toFixed(0) : v.toFixed(1));

  return (
    <div ref={ref} className="w-full">
      {width > 0 && (
        <svg
          width={w}
          height={height}
          role="img"
          aria-label={`折线图，共 ${points.length} 个点，从 ${md(points[0].date)} 的 ${points[0].value}${unit} 到 ${md(points[points.length - 1].date)} 的 ${points[points.length - 1].value}${unit}`}
          className="block touch-pan-y select-none"
          onMouseMove={(e) => pick(e.clientX, e.currentTarget.getBoundingClientRect())}
          onMouseLeave={leave}
          onTouchStart={(e) => pick(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
          onTouchMove={(e) => pick(e.touches[0].clientX, e.currentTarget.getBoundingClientRect())}
        >
          {ticks.map((v) => (
            <g key={v}>
              <line x1={pad.l} x2={w - pad.r} y1={y(v)} y2={y(v)} stroke="var(--line)" strokeWidth="1" />
              <text x={pad.l - 8} y={y(v)} textAnchor="end" dominantBaseline="middle" className="fill-slate-500 text-[11px] tabular-nums">
                {fmt(v)}
              </text>
            </g>
          ))}
          {target !== undefined && targetShown && (
            <g>
              <line x1={pad.l} x2={w - pad.r} y1={y(target)} y2={y(target)} stroke="var(--ink)" strokeOpacity="0.55" strokeWidth="1.5" strokeDasharray="5 4" />
              <text x={w - pad.r} y={y(target) - 6} textAnchor="end" className="fill-slate-600 text-[11px]">
                {targetLabel} {fmt(target)}
                {unit}
              </text>
            </g>
          )}
          {target !== undefined && !targetShown && (
            <text x={w - pad.r} y={target < data[data.length - 1] ? height - pad.b - 6 : pad.t + 10} textAnchor="end" className="fill-slate-600 text-[11px]">
              {targetLabel} {fmt(target)}
              {unit}，在图的{target < data[data.length - 1] ? "下方" : "上方"}
            </text>
          )}
          <path d={path} fill="none" stroke="var(--brand)" strokeWidth="2" strokeLinejoin="round" strokeLinecap="round" />
          {/* 点不多时每个点都画出来；多了只画线，指到哪个再显示哪个 */}
          {points.length <= 31 && points.map((p, i) => <circle key={p.date} cx={x(p.date)} cy={y(p.value)} r={i === active ? 0 : 2.5} fill="var(--brand)" />)}
          {active !== null && (
            <g>
              <line x1={x(points[active].date)} x2={x(points[active].date)} y1={pad.t} y2={height - pad.b} stroke="var(--ink)" strokeOpacity="0.3" strokeWidth="1" />
              <circle cx={x(points[active].date)} cy={y(points[active].value)} r="5" fill="var(--brand)" stroke="var(--paper)" strokeWidth="2" />
            </g>
          )}
          <text x={pad.l} y={height - 5} className="fill-slate-500 text-[11px]">
            {md(points[0].date)}
          </text>
          {points.length > 1 && (
            <text x={w - pad.r} y={height - 5} textAnchor="end" className="fill-slate-500 text-[11px]">
              {md(points[points.length - 1].date)}
            </text>
          )}
        </svg>
      )}
    </div>
  );
}

export type Bar = { key: string; value: number; label: string };

/**
 * 柱状图。reference 给了的话画一条参考线（比如建议摄入）；超过参考线的柱子用红色，
 * 同时读数里会写明"超出多少"，不只靠颜色。overIsGood 表示超过参考线是好事（比如运动时长），那就不变红。
 */
export function BarChart({ bars, reference, height = 140, firstLabel, lastLabel, onHover, overIsGood = false }: { bars: Bar[]; reference?: number; overIsGood?: boolean; height?: number; firstLabel: string; lastLabel: string; onHover: (i: number | null) => void }) {
  const [active, setActive] = useState<number | null>(null);
  const max = Math.max(1, reference ?? 0, ...bars.map((b) => b.value)) * 1.08;
  const set = (i: number | null) => {
    setActive(i);
    onHover(i);
  };
  return (
    <div>
      <div className="relative flex items-end gap-[3px]" style={{ height }} onMouseLeave={() => set(null)}>
        {reference !== undefined && reference > 0 && <div className="pointer-events-none absolute inset-x-0 border-t-[1.5px] border-dashed border-ink/55" style={{ bottom: `${(reference / max) * 100}%` }} aria-hidden />}
        {bars.map((b, i) => {
          const over = !overIsGood && reference !== undefined && reference > 0 && b.value > reference;
          return (
            <button key={b.key} type="button" className="flex h-full min-w-0 flex-1 cursor-default flex-col justify-end outline-offset-1" onMouseEnter={() => set(i)} onFocus={() => set(i)} onBlur={() => set(null)} onClick={() => set(i)} aria-label={b.label}>
              <span
                className="block w-full rounded-t-[4px]"
                style={{ height: b.value > 0 ? `${Math.max(3, (b.value / max) * 100)}%` : "2px", background: b.value <= 0 ? "var(--line)" : over ? `color-mix(in oklab, var(--color-red-500) ${active === i ? 100 : 80}%, transparent)` : shade(active === i ? 100 : 80) }}
              />
            </button>
          );
        })}
      </div>
      <div className="mt-1.5 flex justify-between text-[11px] tabular-nums text-slate-500">
        <span>{firstLabel}</span>
        <span>{lastLabel}</span>
      </div>
    </div>
  );
}
