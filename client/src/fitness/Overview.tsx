import { useEffect, useRef, useState, type FormEvent } from "react";
import { Pencil, RefreshCw, Sparkles } from "lucide-react";
import { toast } from "sonner";
import { api, today } from "../api";
import Modal, { ErrorText } from "../components/Modal";
import { SummaryText, type Summary, type SummaryState } from "../components/AiSummary";
import { ChartCard, LineChart, md } from "./charts";
import type { Measure, TabProps } from "./data";
import { ACTIVITY, bmiLabel, daysToGoal, plan, type Activity, type Profile, type Sex } from "./math";

const addDays = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() + n);
  return d;
};
const daysAgo = (n: number) => addDays(-n).toLocaleDateString("sv");

// ---------- 个人资料 ----------
type Draft = { sex: Sex; birth_year: string; height_cm: string; activity: Activity; target_weight: string; weekly_loss: string };

/**
 * 资料表单。withBody 为真时（第一次填）下面多一行：现在的体重（必填）、腰围和体脂率（可不填），
 * 保存时顺便记成今天的第一条体重记录，这样一步就能看到概览。
 */
export function ProfileForm({ profile, onSaved, onCancel, withBody = false }: { profile: Profile | null; onSaved: () => void; onCancel?: () => void; withBody?: boolean }) {
  const [d, setD] = useState<Draft>(
    profile
      ? { sex: profile.sex, birth_year: String(profile.birth_year), height_cm: String(profile.height_cm), activity: profile.activity, target_weight: String(profile.target_weight), weekly_loss: String(profile.weekly_loss) }
      : { sex: "male", birth_year: "", height_cm: "", activity: "light", target_weight: "", weekly_loss: "0.5" },
  );
  const [body, setBody] = useState({ weight: "", waist: "", body_fat: "" });
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setD((x) => ({ ...x, [k]: v }));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!d.birth_year || !d.height_cm || !d.target_weight) return setError("出生年份、身高、目标体重都要填");
    if (withBody && !body.weight) return setError("填一下现在的体重");
    setSaving(true);
    setError("");
    try {
      await api.put("/fitness/profile", { ...d, birth_year: Number(d.birth_year), height_cm: Number(d.height_cm), target_weight: Number(d.target_weight), weekly_loss: Number(d.weekly_loss) });
      if (withBody) await api.post("/fitness/body", { date: today(), weight: Number(body.weight), waist: body.waist === "" ? null : Number(body.waist), body_fat: body.body_fat === "" ? null : Number(body.body_fat), note: "" });
      toast.success("资料已保存");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <form onSubmit={save} className="space-y-4">
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <span className="label">性别</span>
          <div className="flex rounded-[10px] bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="性别">
            {(["male", "female"] as const).map((s) => (
              <button key={s} type="button" role="radio" aria-checked={d.sex === s} onClick={() => set("sex", s)} className={`flex-1 cursor-pointer rounded-lg py-1 transition ${d.sex === s ? "bg-surface font-medium shadow-sm" : "text-slate-600 hover:text-ink"}`}>
                {s === "male" ? "男" : "女"}
              </button>
            ))}
          </div>
        </div>
        <div>
          <label className="label" htmlFor="fp-year">
            出生年份
          </label>
          <input id="fp-year" className="input" type="number" inputMode="numeric" placeholder="例如 1995" value={d.birth_year} onChange={(e) => set("birth_year", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="fp-height">
            身高（厘米）
          </label>
          <input id="fp-height" className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 172" value={d.height_cm} onChange={(e) => set("height_cm", e.target.value)} />
        </div>
      </div>
      <div className="grid gap-3 sm:grid-cols-3">
        <div>
          <label className="label" htmlFor="fp-act">
            平时活动量
          </label>
          <select id="fp-act" className="input" value={d.activity} onChange={(e) => set("activity", e.target.value as Activity)}>
            {(Object.keys(ACTIVITY) as Activity[]).map((a) => (
              <option key={a} value={a}>
                {ACTIVITY[a].label}：{ACTIVITY[a].hint}
              </option>
            ))}
          </select>
        </div>
        <div>
          <label className="label" htmlFor="fp-target">
            目标体重（公斤）
          </label>
          <input id="fp-target" className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 65" value={d.target_weight} onChange={(e) => set("target_weight", e.target.value)} />
        </div>
        <div>
          <label className="label" htmlFor="fp-loss">
            每周想减
          </label>
          <select id="fp-loss" className="input" value={d.weekly_loss} onChange={(e) => set("weekly_loss", e.target.value)}>
            <option value="0.25">0.25 公斤（慢，容易坚持）</option>
            <option value="0.5">0.5 公斤（推荐）</option>
            <option value="0.75">0.75 公斤（偏快）</option>
            <option value="0">不减，保持体重</option>
          </select>
        </div>
      </div>
      {withBody && (
        <div className="grid gap-3 border-t border-line pt-4 sm:grid-cols-3">
          <div>
            <label className="label" htmlFor="fp-weight">
              现在的体重（公斤）
            </label>
            <input id="fp-weight" className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 72.5" value={body.weight} onChange={(e) => setBody({ ...body, weight: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="fp-waist">
              腰围（厘米，可不填）
            </label>
            <input id="fp-waist" className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 86" value={body.waist} onChange={(e) => setBody({ ...body, waist: e.target.value })} />
          </div>
          <div>
            <label className="label" htmlFor="fp-fat">
              体脂率（%，可不填）
            </label>
            <input id="fp-fat" className="input" type="number" inputMode="decimal" step="0.1" placeholder="例如 22" value={body.body_fat} onChange={(e) => setBody({ ...body, body_fat: e.target.value })} />
          </div>
        </div>
      )}
      <ErrorText msg={error} />
      <div className="flex justify-end gap-2">
        {onCancel && (
          <button type="button" className="btn-ghost" onClick={onCancel}>
            取消
          </button>
        )}
        <button className="btn-primary" disabled={saving}>
          保存
        </button>
      </div>
    </form>
  );
}

// ---------- AI 点评 ----------
function ReviewDialog({ onClose }: { onClose: () => void }) {
  const [state, setState] = useState<SummaryState | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const alive = useRef(true);
  useEffect(() => {
    alive.current = true;
    api.get<SummaryState>("/fitness/review").then(
      (got) => alive.current && setState(got),
      (err) => alive.current && setError((err as Error).message),
    );
    return () => {
      alive.current = false;
    };
  }, []);

  const generate = async () => {
    setBusy(true);
    setError("");
    try {
      const got = await api.post<{ summary: Summary }>("/fitness/review");
      if (alive.current) setState((s) => s && { ...s, summary: got.summary });
    } catch (err) {
      if (alive.current) setError((err as Error).message);
    } finally {
      if (alive.current) setBusy(false);
    }
  };

  return (
    <Modal title="AI 点评" onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <span className="text-xs text-slate-500">{state?.summary ? `${md(state.summary.start)} – ${md(state.summary.end)} 的点评` : state ? `最近 7 天（${md(state.range.start)} – ${md(state.range.end)}）` : "最近 7 天"}</span>
        {state?.configured && (
          <button className="btn-primary ml-auto" onClick={generate} disabled={busy}>
            {busy ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "正在写…" : state.summary ? "重新生成" : "生成点评"}
          </button>
        )}
      </div>
      {error && <p className="mb-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}
      {state === null ? (
        !error && <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : !state.configured ? (
        <div className="rounded-2xl bg-ink/5 px-4 py-4 text-sm leading-7">
          <p className="font-medium">还没有配置 AI 模型</p>
          <p className="mt-1 text-slate-600">
            在项目文件夹里把 <code className="font-mono text-[13px]">.env.example</code> 复制一份，改名为 <code className="font-mono text-[13px]">.env</code>，填上接口地址、密钥和模型名，然后重启网站。其他功能不受影响。
          </p>
        </div>
      ) : busy ? (
        <div className="rounded-2xl bg-ink/5 px-4 py-10 text-center text-sm text-slate-500">正在让 {state.model} 看你最近 7 天的记录，一般要十几秒到一分钟，别关这个窗口…</div>
      ) : state.summary ? (
        <>
          <div className="rounded-2xl bg-ink/5 px-4 py-4 sm:px-5">
            <SummaryText text={state.summary.content} />
          </div>
          <p className="mt-2.5 text-xs text-slate-500">
            {new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(state.summary.createdAt))} 由 {state.summary.model} 生成。AI
            的建议只供参考，不是医疗建议。
          </p>
        </>
      ) : (
        <div className="rounded-2xl bg-ink/5 px-4 py-10 text-center text-sm text-slate-500">
          还没有生成过点评。点右上方的「生成点评」，AI 会看你最近 7 天的记录。
          <span className="mt-1.5 block text-xs">生成时会把你的资料和这 7 天的体重、饮食、运动、力量记录发给 {state.model}。</span>
        </div>
      )}
    </Modal>
  );
}

// ---------- 概览 ----------
function Stat({ label, value, unit, hint }: { label: string; value: string | number; unit?: string; hint?: string }) {
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1 font-display text-[1.6rem] font-light leading-none tabular-nums">
        {value}
        {unit && <span className="ml-1 font-sans text-xs font-normal text-slate-500">{unit}</span>}
      </div>
      {hint && <div className="mt-1.5 text-xs text-slate-500">{hint}</div>}
    </div>
  );
}

/** 腰围 / 体脂率：最近一次的数字、哪天记的、和第一次相比变了多少；没记过就提示去记 */
function MeasureStat({ label, unit, m, onAdd }: { label: string; unit: string; m: Measure | null; onAdd: () => void }) {
  if (!m) {
    return (
      <div className="min-w-0">
        <div className="text-xs text-slate-500">{label}</div>
        <div className="mt-1.5 font-display text-[1.75rem] font-extralight leading-none text-slate-400">–</div>
        <button className="mt-1.5 cursor-pointer text-xs text-slate-500 underline underline-offset-4 hover:text-ink" onClick={onAdd}>
          还没记过，去记一次
        </button>
      </div>
    );
  }
  const diff = Math.round((m.value - m.firstValue) * 10) / 10;
  return (
    <div className="min-w-0">
      <div className="text-xs text-slate-500">
        {label} · {md(m.date)}
      </div>
      <div className="mt-1.5 font-display text-[1.75rem] font-extralight leading-none tabular-nums">
        {m.value}
        <span className="ml-1 font-sans text-sm font-normal text-slate-500">{unit}</span>
      </div>
      <div className="mt-1.5 text-xs tabular-nums text-slate-500">{m.firstDate === m.date ? "只记过这一次" : diff === 0 ? `和 ${md(m.firstDate)} 持平` : `比 ${md(m.firstDate)} ${diff < 0 ? "少了" : "多了"} ${Math.abs(diff)} ${unit}`}</div>
    </div>
  );
}

export default function OverviewTab({ overview: o, reload, goto }: TabProps & { goto: (tab: "body" | "food" | "workouts") => void }) {
  const [editing, setEditing] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [range, setRange] = useState<30 | 90 | 180>(30);
  const [hover, setHover] = useState<number | null>(null);

  // 第一次来：先填资料
  if (!o.profile) {
    return (
      <div className="card mx-auto max-w-2xl px-5 py-5">
        <h2 className="text-base font-semibold">先填一下基本情况</h2>
        <p className="mb-4 mt-1 text-sm text-slate-500">用来估算你的基础代谢、每天该吃多少、多久能到目标。以后随时可以改。</p>
        <ProfileForm profile={null} onSaved={reload} withBody />
      </div>
    );
  }
  const p = o.profile;

  // 填了资料但还没记过体重：没有体重算不出任何数字
  if (!o.latest || !o.first) {
    return (
      <div className="card mx-auto max-w-2xl px-5 py-10 text-center">
        <p className="text-sm text-slate-600">资料填好了。再记一次现在的体重，就能算出你每天该吃多少。</p>
        <button className="btn-primary mt-4" onClick={() => goto("body")}>
          去记体重
        </button>
      </div>
    );
  }

  const weight = o.latest.weight;
  const pl = plan(p, weight);
  const lost = Math.round((o.first.weight - weight) * 10) / 10;
  const left = Math.round((weight - p.target_weight) * 10) / 10;
  const toGo = daysToGoal(weight, p.target_weight, p.weekly_loss);
  const total = o.first.weight - p.target_weight;
  const progress = total > 0 ? Math.min(100, Math.max(0, ((o.first.weight - weight) / total) * 100)) : weight <= p.target_weight ? 100 : 0;

  // 今天的热量：能吃的 = 建议摄入；运动消耗单独列出来，不自动加回去（加回去容易吃超）
  const over = o.today.eaten - pl.intake;
  const eatenPct = Math.min(100, (o.today.eaten / pl.intake) * 100);

  const points = o.weights.filter((w) => w.date >= daysAgo(range - 1)).map((w) => ({ date: w.date, value: w.weight }));
  const stale = Math.round((Date.now() - new Date(o.latest.date + "T12:00:00").getTime()) / 86_400_000);

  return (
    <div className="space-y-4">
      {/* 进度 */}
      <section className="card px-5 py-5">
        <div className="flex flex-wrap items-end justify-between gap-x-6 gap-y-3">
          <div className="flex flex-wrap items-end gap-x-10 gap-y-4">
            <div>
              <div className="text-xs text-slate-500">
                现在的体重 · {stale <= 0 ? "今天记的" : `${stale} 天前记的`}
                {stale >= 7 && "，该再称一次了"}
              </div>
              <div className="mt-1.5 font-display text-[3rem] font-extralight leading-none tabular-nums">
                {weight}
                <span className="ml-1.5 font-sans text-base font-normal text-slate-500">公斤</span>
              </div>
            </div>
            <MeasureStat label="腰围" unit="厘米" m={o.waist} onAdd={() => goto("body")} />
            <MeasureStat label="体脂率" unit="%" m={o.bodyFat} onAdd={() => goto("body")} />
          </div>
          <div className="flex flex-wrap gap-2">
            <button className="btn bg-ink/8 hover:bg-ink/12" onClick={() => setReviewing(true)}>
              <Sparkles className="size-4 text-brand" /> AI 点评
            </button>
            <button className="btn-ghost" onClick={() => setEditing(true)}>
              <Pencil className="size-4" /> 改资料
            </button>
          </div>
        </div>

        <div className="mt-5">
          <div className="h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={100} aria-valuenow={Math.round(progress)} aria-label="减重进度">
            <div className="h-full rounded-full bg-brand transition-[width]" style={{ width: `${progress}%` }} />
          </div>
          <div className="mt-2 flex justify-between text-xs tabular-nums text-slate-500">
            <span>
              起始 {o.first.weight} · {md(o.first.date)}
            </span>
            <span>目标 {p.target_weight}</span>
          </div>
        </div>

        <div className="mt-5 grid grid-cols-2 gap-x-4 gap-y-5 sm:grid-cols-4">
          <Stat label={lost >= 0 ? "已经减了" : "比起始重了"} value={Math.abs(lost)} unit="公斤" />
          <Stat label={left > 0 ? "离目标还差" : "已经达到目标"} value={left > 0 ? left : "✓"} unit={left > 0 ? "公斤" : undefined} hint={left > 0 && toGo ? `按计划约 ${toGo} 天，${md(addDays(toGo).toLocaleDateString("sv"))} 前后` : undefined} />
          <Stat label="BMI" value={pl.bmi} hint={bmiLabel(pl.bmi)} />
          <Stat label="建议每日摄入" value={pl.intake} unit="千卡" hint={`基础代谢 ${pl.bmr} · 每日消耗约 ${pl.tdee}`} />
        </div>
        {pl.capped && <p className="mt-4 rounded-xl bg-amber-500/15 px-3.5 py-2.5 text-xs leading-relaxed text-amber-700">按你设的减重速度算出来的摄入低于安全下限，这里按下限 {pl.intake} 千卡给。建议把「每周想减」调慢一些，或者多运动来补这个差。</p>}
      </section>

      <div className="grid gap-4 lg:grid-cols-2">
        {/* 今天的热量 */}
        <section className="card px-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">今天的热量</h2>
            <button className="cursor-pointer text-xs text-slate-500 underline-offset-4 hover:text-ink hover:underline" onClick={() => goto("food")}>
              去记饮食
            </button>
          </div>
          <div className="flex items-baseline gap-2">
            <span className="font-display text-[2rem] font-extralight leading-none tabular-nums">{o.today.eaten}</span>
            <span className="text-sm text-slate-500">/ {pl.intake} 千卡</span>
          </div>
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={pl.intake} aria-valuenow={o.today.eaten} aria-label="今天已经吃的热量">
            <div className={`h-full rounded-full transition-[width] ${over > 0 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${eatenPct}%` }} />
          </div>
          <p className={`mt-2 text-xs ${over > 0 ? "font-medium text-red-600" : "text-slate-500"}`}>
            {o.today.eaten === 0 ? "今天还没有记饮食。" : over > 0 ? `已经超出 ${over} 千卡。` : `还可以吃 ${-over} 千卡。`}
            {o.today.burned > 0 && <span className="font-normal text-slate-500"> 今天运动消耗了约 {o.today.burned} 千卡。</span>}
          </p>
        </section>

        {/* 本周的运动 */}
        <section className="card px-5">
          <div className="mb-3 flex items-baseline justify-between">
            <h2 className="text-sm font-medium">本周的运动</h2>
            <button className="cursor-pointer text-xs text-slate-500 underline-offset-4 hover:text-ink hover:underline" onClick={() => goto("workouts")}>
              去记运动
            </button>
          </div>
          <div className="grid grid-cols-3 gap-3">
            <Stat label="次数" value={o.week.count} unit="次" />
            <Stat label="时长" value={o.week.minutes} unit="分钟" />
            <Stat label="消耗" value={o.week.kcal} unit="千卡" />
          </div>
          <p className="mt-3 text-xs text-slate-500">{o.week.count === 0 ? "这周还没有运动记录。" : `这周有 ${o.week.days} 天动了。一般建议每周至少 150 分钟中等强度运动${o.week.minutes >= 150 ? "，已经达到。" : `，还差 ${150 - o.week.minutes} 分钟。`}`}</p>
        </section>
      </div>

      {/* 体重曲线 */}
      <ChartCard
        title="体重变化"
        hint={points.length ? `${points.length} 次记录` : ""}
        readout={hover !== null && points[hover] ? `${md(points[hover].date)} ${points[hover].value} 公斤` : ""}
        action={
          <div className="flex rounded-lg bg-ink/6 p-0.5 text-xs" role="radiogroup" aria-label="时间范围">
            {([30, 90, 180] as const).map((r) => (
              <button
                key={r}
                role="radio"
                aria-checked={range === r}
                onClick={() => {
                  setRange(r);
                  setHover(null);
                }}
                className={`cursor-pointer rounded-md px-2 py-0.5 transition ${range === r ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`}
              >
                {r} 天
              </button>
            ))}
          </div>
        }
      >
        {points.length < 2 ? (
          <p className="py-10 text-center text-sm text-slate-400">最近 {range} 天里记了不到两次体重，画不出曲线。隔几天称一次、记一次就有了。</p>
        ) : (
          <LineChart points={points} target={p.target_weight} unit=" 公斤" onHover={setHover} />
        )}
      </ChartCard>

      {editing && (
        <Modal title="个人资料" onClose={() => setEditing(false)} wide>
          <ProfileForm
            profile={p}
            onCancel={() => setEditing(false)}
            onSaved={() => {
              setEditing(false);
              reload();
            }}
          />
        </Modal>
      )}
      {reviewing && <ReviewDialog onClose={() => setReviewing(false)} />}
    </div>
  );
}
