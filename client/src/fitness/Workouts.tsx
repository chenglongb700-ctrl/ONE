import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today, type Workout } from "../api";
import Modal, { ErrorText } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { BarChart, ChartCard, md } from "./charts";
import type { TabProps } from "./data";
import { WORKOUT_TYPES, metOf } from "./exercises";
import { burned } from "./math";

/** 运动：每次运动记一条，消耗的热量按类型、时长和体重估算，也可以手动改 */
type Draft = { date: string; type: string; minutes: string; kcal: string; note: string; kcalEdited: boolean };
const blank = (): Draft => ({ date: today(), type: "跑步", minutes: "", kcal: "", note: "", kcalEdited: false });

function Form({ d, setD, weight, submitLabel, error, onCancel, idp }: { idp: string; d: Draft; setD: (d: Draft) => void; weight: number | null; submitLabel: string; error: string; onCancel?: () => void }) {
  // 没手动改过热量时，类型或时长一变就重新估算
  const estimate = (type: string, minutes: string) => (weight && Number(minutes) > 0 ? String(burned(metOf(type), weight, Number(minutes))) : "");
  const change = (patch: Partial<Draft>) => {
    const next = { ...d, ...patch };
    if (!next.kcalEdited) next.kcal = estimate(next.type, next.minutes);
    setD(next);
  };
  return (
    <>
      <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <div>
          <label className="label" htmlFor={`${idp}-date`}>
            日期
          </label>
          <input id={`${idp}-date`} className="input" type="date" max={today()} value={d.date} onChange={(e) => change({ date: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-type`}>
            运动类型
          </label>
          <select id={`${idp}-type`} className="input" value={d.type} onChange={(e) => change({ type: e.target.value })}>
            {/* 以前记过、现在清单里没有的类型也要能显示 */}
            {!WORKOUT_TYPES.some((t) => t.name === d.type) && <option value={d.type}>{d.type}</option>}
            {WORKOUT_TYPES.map((t) => (
              <option key={t.name} value={t.name}>
                {t.name}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-min`}>
            时长（分钟）
          </label>
          <input id={`${idp}-min`} className="input" type="number" inputMode="numeric" min="1" placeholder="例如 30" value={d.minutes} onChange={(e) => change({ minutes: e.target.value })} />
        </div>
        <div>
          <label className="label" htmlFor={`${idp}-kcal`}>
            消耗（千卡{d.kcalEdited ? "" : "，估算"}）
          </label>
          <input id={`${idp}-kcal`} className="input" type="number" inputMode="numeric" min="0" placeholder={weight ? "自动估算" : "可不填"} value={d.kcal} onChange={(e) => setD({ ...d, kcal: e.target.value, kcalEdited: e.target.value !== "" })} />
        </div>
      </div>
      <div className="mt-3 flex flex-wrap items-end gap-3">
        <div className="min-w-40 flex-1">
          <label className="label" htmlFor={`${idp}-note`}>
            备注（可不填）
          </label>
          <input id={`${idp}-note`} className="input" placeholder="例如 5 公里，配速 6 分" value={d.note} onChange={(e) => setD({ ...d, note: e.target.value })} />
        </div>
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            取消
          </button>
        )}
        <button className="btn-primary">
          {!onCancel && <Plus className="size-4" />} {submitLabel}
        </button>
      </div>
      <ErrorText msg={error} />
    </>
  );
}

export default function WorkoutsTab({ overview: o, reload }: TabProps) {
  const [list, setList] = useState<Workout[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");
  const [hover, setHover] = useState<number | null>(null);
  const weight = o.latest?.weight ?? null;

  const load = () => api.get<Workout[]>("/fitness/workouts").then(setList, (err) => toast.error((err as Error).message));
  useEffect(() => {
    load();
  }, []);
  const changed = () => {
    load();
    reload();
  };
  const body = (d: Draft) => ({ date: d.date, type: d.type, minutes: Number(d.minutes), kcal: d.kcal === "" ? 0 : Number(d.kcal), note: d.note });

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!(Number(draft.minutes) > 0)) return setError("填一下运动了多少分钟");
    setError("");
    try {
      await api.post("/fitness/workouts", body(draft));
      toast.success(`已记下：${draft.type} ${draft.minutes} 分钟`);
      setDraft({ ...blank(), type: draft.type });
      changed();
    } catch (err) {
      setError((err as Error).message);
    }
  };
  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!(Number(editing.draft.minutes) > 0)) return setEditError("填一下运动了多少分钟");
    try {
      await api.put(`/fitness/workouts/${editing.id}`, body(editing.draft));
      setEditing(null);
      changed();
    } catch (err) {
      setEditError((err as Error).message);
    }
  };
  const remove = async (w: Workout) => {
    if (!(await confirmDialog({ title: "删除这次运动？", message: `${w.date} 的 ${w.type} ${w.minutes} 分钟，删除后无法恢复。`, danger: true }))) return;
    try {
      await api.del(`/fitness/workouts/${w.id}`);
      changed();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const bars = o.workoutWeeks.map((w, i) => ({ key: w.start, value: w.minutes, label: `${i === o.workoutWeeks.length - 1 ? "本周" : `${md(w.start)} 那一周`} ${w.minutes} 分钟` }));

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card px-5">
        <Form idp="wn" d={draft} setD={setDraft} weight={weight} submitLabel="记一次" error={error} />
        <p className="mt-2.5 text-xs text-slate-500">{weight ? `消耗是按运动类型、时长和你现在的体重（${weight} 公斤）估算的，强度不同会差不少；有手环的话直接填手环上的数字。` : "记一次体重之后，这里会自动估算消耗的热量。"}</p>
      </form>

      <ChartCard title="最近 8 周的运动时长" hint="虚线是每周 150 分钟" readout={hover !== null ? bars[hover].label : ""}>
        <BarChart bars={bars} reference={150} firstLabel={`${md(o.workoutWeeks[0].start)} 那一周`} lastLabel="本周" onHover={setHover} overIsGood />
      </ChartCard>

      {list === null ? (
        <div className="card h-32 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">还没有运动记录。动完之后在上面记一次。</div>
      ) : (
        <ul className="card divide-y divide-line !py-1">
          {list.map((w) => (
            <li key={w.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
              <span className="w-24 shrink-0 tabular-nums text-slate-500">{w.date}</span>
              <span className="w-24 shrink-0 font-medium">{w.type}</span>
              <span className="w-20 shrink-0 tabular-nums">{w.minutes} 分钟</span>
              <span className="w-24 shrink-0 text-xs tabular-nums text-slate-500">{w.kcal > 0 ? `约 ${Math.round(w.kcal)} 千卡` : ""}</span>
              <span className="min-w-0 flex-1 truncate text-xs text-slate-500">{w.note}</span>
              <span className="flex shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                <button
                  className="btn-ghost p-1.5"
                  title="编辑"
                  aria-label={`编辑 ${w.date} 的 ${w.type}`}
                  onClick={() => {
                    setEditError("");
                    setEditing({ id: w.id, draft: { date: w.date, type: w.type, minutes: String(w.minutes), kcal: w.kcal ? String(Math.round(w.kcal)) : "", note: w.note, kcalEdited: true } });
                  }}
                >
                  <Pencil className="size-3.5" />
                </button>
                <button className="btn-danger p-1.5" title="删除" aria-label={`删除 ${w.date} 的 ${w.type}`} onClick={() => remove(w)}>
                  <Trash2 className="size-3.5" />
                </button>
              </span>
            </li>
          ))}
        </ul>
      )}

      {editing && (
        <Modal title="编辑运动记录" onClose={() => setEditing(null)} wide>
          <form onSubmit={saveEdit}>
            <Form idp="we" d={editing.draft} setD={(d) => setEditing({ id: editing.id, draft: d })} weight={weight} submitLabel="保存" error={editError} onCancel={() => setEditing(null)} />
          </form>
        </Modal>
      )}
    </div>
  );
}
