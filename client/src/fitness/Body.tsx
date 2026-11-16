import { useEffect, useState, type FormEvent } from "react";
import { Pencil, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today, type BodyLog } from "../api";
import Modal, { ErrorText } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { ChartCard, LineChart, md } from "./charts";
import { num, type TabProps } from "./data";

/** 体重和围度：上面快速记一条（同一天再记就是修改），中间是变化曲线，下面是历史 */
type Draft = { date: string; weight: string; waist: string; body_fat: string; note: string };
const blank = (): Draft => ({ date: today(), weight: "", waist: "", body_fat: "", note: "" });
const toDraft = (b: BodyLog): Draft => ({ date: b.date, weight: String(b.weight), waist: b.waist === null ? "" : String(b.waist), body_fat: b.body_fat === null ? "" : String(b.body_fat), note: b.note });
const payload = (d: Draft) => ({ date: d.date, weight: Number(d.weight), waist: num(d.waist), body_fat: num(d.body_fat), note: d.note });

function Fields({ d, set, idp }: { d: Draft; set: (k: keyof Draft, v: string) => void; idp: string }) {
  return (
    <>
      <div>
        <label className="label" htmlFor={`${idp}-date`}>
          日期
        </label>
        <input id={`${idp}-date`} className="input" type="date" max={today()} value={d.date} onChange={(e) => set("date", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-weight`}>
          体重（公斤）
        </label>
        <input id={`${idp}-weight`} className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 72.5" value={d.weight} onChange={(e) => set("weight", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-waist`}>
          腰围（厘米，可不填）
        </label>
        <input id={`${idp}-waist`} className="input" type="number" inputMode="decimal" step="0.1" value={d.waist} onChange={(e) => set("waist", e.target.value)} />
      </div>
      <div>
        <label className="label" htmlFor={`${idp}-fat`}>
          体脂率（%，可不填）
        </label>
        <input id={`${idp}-fat`} className="input" type="number" inputMode="decimal" step="0.1" value={d.body_fat} onChange={(e) => set("body_fat", e.target.value)} />
      </div>
    </>
  );
}

// 曲线可以看三样：体重、腰围、体脂率（后两样记过才有）
const METRICS = [
  { key: "weight", label: "体重", unit: " 公斤" },
  { key: "waist", label: "腰围", unit: " 厘米" },
  { key: "body_fat", label: "体脂率", unit: "%" },
] as const;
type Metric = (typeof METRICS)[number]["key"];
const RANGES = [30, 90, 180, 0] as const; // 0 = 全部

export default function BodyTab({ overview, reload }: TabProps) {
  const [metric, setMetric] = useState<Metric>("weight");
  const [range, setRange] = useState<(typeof RANGES)[number]>(90);
  const [hover, setHover] = useState<number | null>(null);
  const [list, setList] = useState<BodyLog[] | null>(null);
  const [draft, setDraft] = useState<Draft>(blank);
  const [editing, setEditing] = useState<{ id: number; draft: Draft } | null>(null);
  const [error, setError] = useState("");
  const [editError, setEditError] = useState("");

  const load = () => api.get<BodyLog[]>("/fitness/body").then(setList, (err) => toast.error((err as Error).message));
  useEffect(() => {
    load();
  }, []);
  const changed = () => {
    load();
    reload();
  };

  const add = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft.weight) return setError("填一下体重");
    setError("");
    try {
      const existed = list?.some((b) => b.date === draft.date);
      await api.post("/fitness/body", payload(draft));
      toast.success(existed ? `已更新 ${draft.date} 的记录` : "已记下");
      setDraft(blank());
      changed();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const saveEdit = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    if (!editing.draft.weight) return setEditError("填一下体重");
    try {
      await api.put(`/fitness/body/${editing.id}`, payload(editing.draft));
      setEditing(null);
      changed();
    } catch (err) {
      setEditError((err as Error).message);
    }
  };

  const remove = async (b: BodyLog) => {
    if (!(await confirmDialog({ title: "删除这条记录？", message: `${b.date} 的 ${b.weight} 公斤，删除后无法恢复。`, danger: true }))) return;
    try {
      await api.del(`/fitness/body/${b.id}`);
      changed();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // 曲线上的点：选中的那一项里记了数字的，按日期从早到晚；再按时间范围截取
  const M = METRICS.find((m) => m.key === metric)!;
  const since = range === 0 ? "" : new Date(Date.now() - (range - 1) * 86_400_000).toLocaleDateString("sv");
  const points = (list ?? [])
    .filter((b) => b[metric] !== null && b.date >= since)
    .map((b) => ({ date: b.date, value: b[metric] as number }))
    .reverse();
  const change = points.length > 1 ? Math.round((points[points.length - 1].value - points[0].value) * 10) / 10 : null;
  const pill = (on: boolean) => `cursor-pointer rounded-md px-2 py-0.5 transition ${on ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`;

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card px-5">
        <div className="grid items-end gap-3 sm:grid-cols-2 lg:grid-cols-[repeat(4,minmax(0,1fr))_auto]">
          <Fields d={draft} set={(k, v) => setDraft((x) => ({ ...x, [k]: v }))} idp="bn" />
          <button className="btn-primary">
            <Plus className="size-4" /> 记一条
          </button>
        </div>
        <p className="mt-2.5 text-xs text-slate-500">尽量固定在同一个时间称（比如早上起床后），数字才好比较。同一天再记一次会覆盖那天的记录。</p>
        <ErrorText msg={error} />
      </form>

      {list !== null && list.length > 0 && (
        <ChartCard
          title="变化曲线"
          hint={change === null ? "" : `这段时间${change === 0 ? "持平" : `${change < 0 ? "降了" : "升了"} ${Math.abs(change)}${M.unit}`} · ${points.length} 次记录`}
          readout={hover !== null && points[hover] ? `${md(points[hover].date)} ${points[hover].value}${M.unit}` : ""}
          action={
            <div className="flex flex-wrap gap-2 text-xs">
              <div className="flex rounded-lg bg-ink/6 p-0.5" role="radiogroup" aria-label="看哪一项">
                {METRICS.map((m) => (
                  <button
                    key={m.key}
                    role="radio"
                    aria-checked={metric === m.key}
                    className={pill(metric === m.key)}
                    onClick={() => {
                      setMetric(m.key);
                      setHover(null);
                    }}
                  >
                    {m.label}
                  </button>
                ))}
              </div>
              <div className="flex rounded-lg bg-ink/6 p-0.5" role="radiogroup" aria-label="时间范围">
                {RANGES.map((r) => (
                  <button
                    key={r}
                    role="radio"
                    aria-checked={range === r}
                    className={pill(range === r)}
                    onClick={() => {
                      setRange(r);
                      setHover(null);
                    }}
                  >
                    {r === 0 ? "全部" : `${r} 天`}
                  </button>
                ))}
              </div>
            </div>
          }
        >
          {points.length < 2 ? (
            <p className="py-10 text-center text-sm text-slate-400">
              {range === 0 ? "" : `最近 ${range} 天里`}
              {M.label}只记了 {points.length} 次，至少两次才能画出曲线。{metric !== "weight" && "记体重的时候顺手填上，这里就有了。"}
            </p>
          ) : (
            <LineChart points={points} target={metric === "weight" ? overview.profile?.target_weight : undefined} unit={M.unit} onHover={setHover} />
          )}
        </ChartCard>
      )}

      {list === null ? (
        <div className="card h-32 animate-pulse" />
      ) : list.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">还没有记录。在上面记下今天的体重。</div>
      ) : (
        <ul className="card divide-y divide-line !py-1">
          {list.map((b, i) => {
            // 和上一次（更早的那条）比变了多少
            const prev = list[i + 1];
            const diff = prev ? Math.round((b.weight - prev.weight) * 10) / 10 : null;
            return (
              <li key={b.id} className="group flex flex-wrap items-center gap-x-4 gap-y-1 py-2.5 text-sm">
                <span className="w-24 shrink-0 tabular-nums text-slate-500">{b.date}</span>
                <span className="w-24 shrink-0 font-medium tabular-nums">{b.weight} 公斤</span>
                <span className="w-16 shrink-0 text-xs tabular-nums text-slate-500" title="和上一次记录相比">
                  {diff === null ? "" : diff === 0 ? "持平" : `${diff > 0 ? "+" : "−"}${Math.abs(diff)}`}
                </span>
                <span className="min-w-0 flex-1 truncate text-xs text-slate-500">
                  {[b.waist !== null && `腰围 ${b.waist} cm`, b.body_fat !== null && `体脂 ${b.body_fat}%`, b.note].filter(Boolean).join(" · ")}
                </span>
                <span className="flex shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                  <button
                    className="btn-ghost p-1.5"
                    title="编辑"
                    aria-label={`编辑 ${b.date} 的记录`}
                    onClick={() => {
                      setEditError("");
                      setEditing({ id: b.id, draft: toDraft(b) });
                    }}
                  >
                    <Pencil className="size-3.5" />
                  </button>
                  <button className="btn-danger p-1.5" title="删除" aria-label={`删除 ${b.date} 的记录`} onClick={() => remove(b)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </span>
              </li>
            );
          })}
        </ul>
      )}

      {editing && (
        <Modal title="编辑记录" onClose={() => setEditing(null)}>
          <form onSubmit={saveEdit} className="space-y-3">
            <div className="grid gap-3 sm:grid-cols-2">
              <Fields d={editing.draft} set={(k, v) => setEditing((x) => x && { ...x, draft: { ...x.draft, [k]: v } })} idp="be" />
            </div>
            <div>
              <label className="label" htmlFor="be-note">
                备注
              </label>
              <input id="be-note" className="input" value={editing.draft.note} onChange={(e) => setEditing((x) => x && { ...x, draft: { ...x.draft, note: e.target.value } })} />
            </div>
            <ErrorText msg={editError} />
            <div className="flex justify-end gap-2 pt-1">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn-primary">保存</button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
