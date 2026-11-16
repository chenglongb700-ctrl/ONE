import { useEffect, useMemo, useState, type FormEvent } from "react";
import { Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today, type StrengthLog } from "../api";
import { ErrorText } from "../components/Modal";
import { ChartCard, LineChart, md } from "./charts";
import type { TabProps } from "./data";
import { STRENGTH_EXERCISES } from "./exercises";

/** 力量训练：某天做的某个动作记一条（重量 × 每组次数 × 组数），并能看一个动作的重量进步 */
type Progress = { date: string; weight: number; reps: number; total: number };
type Draft = { date: string; exercise: string; weight: string; reps: string; sets: string };

export default function StrengthTab(_: TabProps) {
  const [list, setList] = useState<StrengthLog[] | null>(null);
  const [draft, setDraft] = useState<Draft>({ date: today(), exercise: "", weight: "", reps: "", sets: "" });
  const [error, setError] = useState("");
  const [focus, setFocus] = useState(""); // 正在看哪个动作的进步
  const [progress, setProgress] = useState<Progress[]>([]);
  const [hover, setHover] = useState<number | null>(null);
  const set = (k: keyof Draft, v: string) => setDraft((d) => ({ ...d, [k]: v }));

  const load = () => api.get<StrengthLog[]>("/fitness/strength").then(setList, (err) => toast.error((err as Error).message));
  useEffect(() => {
    load();
  }, []);

  // 做过的动作（做得多的在前）；默认看做得最多的那个
  const done = useMemo(() => {
    const count = new Map<string, number>();
    for (const s of list ?? []) count.set(s.exercise, (count.get(s.exercise) ?? 0) + 1);
    return [...count].sort((a, b) => b[1] - a[1]).map(([name]) => name);
  }, [list]);
  useEffect(() => {
    if (done.length && !done.includes(focus)) setFocus(done[0]);
  }, [done, focus]);
  useEffect(() => {
    setHover(null);
    if (!focus) return setProgress([]);
    api.get<Progress[]>(`/fitness/strength/progress?exercise=${encodeURIComponent(focus)}`).then(setProgress, () => setProgress([]));
  }, [focus, list]);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.exercise.trim()) return setError("写一下做的什么动作");
    if (!(Number(draft.reps) > 0) || !(Number(draft.sets) > 0)) return setError("每组次数和组数都要填");
    setError("");
    try {
      await api.post("/fitness/strength", { date: draft.date, exercise: draft.exercise.trim(), weight: draft.weight === "" ? 0 : Number(draft.weight), reps: Number(draft.reps), sets: Number(draft.sets) });
      toast.success(`已记下：${draft.exercise.trim()}`);
      setFocus(draft.exercise.trim());
      // 日期留着，方便接着记同一天的下一个动作
      setDraft({ date: draft.date, exercise: "", weight: "", reps: "", sets: "" });
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const remove = async (s: StrengthLog) => {
    try {
      await api.del(`/fitness/strength/${s.id}`);
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // 按训练日分组
  const days = useMemo(() => {
    const m = new Map<string, StrengthLog[]>();
    for (const s of list ?? []) m.set(s.date, [...(m.get(s.date) ?? []), s]);
    return [...m];
  }, [list]);

  // 自重动作（重量都是 0）看每组最多做了几次，其余看最大重量
  const bodyweight = progress.length > 0 && progress.every((p) => p.weight === 0);
  const points = progress.map((p) => ({ date: p.date, value: bodyweight ? p.reps : p.weight }));
  const best = points.length ? Math.max(...points.map((p) => p.value)) : 0;
  const unit = bodyweight ? " 次" : " 公斤";
  const options = [...new Set([...done, ...STRENGTH_EXERCISES])];

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card px-5">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)_repeat(3,minmax(0,0.8fr))_auto]">
          <div>
            <label className="label" htmlFor="st-date">
              日期
            </label>
            <input id="st-date" className="input" type="date" max={today()} value={draft.date} onChange={(e) => set("date", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-ex">
              动作
            </label>
            <input id="st-ex" className="input" list="st-exercises" placeholder="选一个或自己填" value={draft.exercise} onChange={(e) => set("exercise", e.target.value)} />
            <datalist id="st-exercises">
              {options.map((x) => (
                <option key={x} value={x} />
              ))}
            </datalist>
          </div>
          <div>
            <label className="label" htmlFor="st-w">
              重量（公斤）
            </label>
            <input id="st-w" className="input" type="number" inputMode="decimal" step="0.5" min="0" placeholder="自重填 0" value={draft.weight} onChange={(e) => set("weight", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-r">
              每组次数
            </label>
            <input id="st-r" className="input" type="number" inputMode="numeric" min="1" value={draft.reps} onChange={(e) => set("reps", e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="st-s">
              组数
            </label>
            <input id="st-s" className="input" type="number" inputMode="numeric" min="1" value={draft.sets} onChange={(e) => set("sets", e.target.value)} />
          </div>
          <button className="btn-primary">
            <Plus className="size-4" /> 记一条
          </button>
        </div>
        <ErrorText msg={error} />
      </form>

      {list === null ? (
        <div className="card h-32 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">还没有力量训练的记录。练完之后在上面记下每个动作的重量、次数和组数。</div>
      ) : (
        <>
          <ChartCard
            title="动作的进步"
            hint={points.length ? `最好成绩 ${best}${unit} · 练过 ${points.length} 天` : ""}
            readout={hover !== null && progress[hover] ? `${md(progress[hover].date)} ${bodyweight ? `每组最多 ${progress[hover].reps} 次` : `最大 ${progress[hover].weight} 公斤`}，共 ${progress[hover].total} 次` : ""}
            action={
              <select className="input w-auto py-1 text-xs" value={focus} onChange={(e) => setFocus(e.target.value)} aria-label="看哪个动作">
                {done.map((x) => (
                  <option key={x} value={x}>
                    {x}
                  </option>
                ))}
              </select>
            }
          >
            {points.length < 2 ? (
              <p className="py-10 text-center text-sm text-slate-400">
                「{focus}」只练过 {points.length} 天{points.length === 1 && `（${best}${unit}）`}，再练一次就能看到变化。
              </p>
            ) : (
              <LineChart points={points} unit={unit} onHover={setHover} />
            )}
          </ChartCard>

          <div className="space-y-3">
            {days.map(([date, items]) => (
              <section key={date} className="card px-5">
                <h2 className="mb-1 text-sm font-medium">
                  {date === today() ? "今天" : date}
                  <span className="ml-2 font-normal text-slate-500">{items.length} 个动作</span>
                </h2>
                <ul className="divide-y divide-line border-t border-line">
                  {items.map((s) => (
                    <li key={s.id} className="group flex items-center gap-3 py-2 text-sm">
                      <button className="min-w-0 flex-1 cursor-pointer truncate text-left underline-offset-4 hover:underline" onClick={() => setFocus(s.exercise)} title="看这个动作的进步">
                        {s.exercise}
                      </button>
                      <span className="shrink-0 tabular-nums text-slate-600">
                        {s.weight > 0 ? `${s.weight} 公斤 × ` : ""}
                        {s.reps} 次 × {s.sets} 组
                      </span>
                      <button className="btn-danger shrink-0 p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="删除" aria-label={`删除 ${s.exercise}`} onClick={() => remove(s)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </>
      )}
    </div>
  );
}
