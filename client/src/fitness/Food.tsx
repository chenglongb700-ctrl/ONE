import { useEffect, useMemo, useState, type FormEvent } from "react";
import { ChevronLeft, ChevronRight, Plus, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today, type FoodLog, type Meal } from "../api";
import Modal, { ErrorText } from "../components/Modal";
import { BarChart, ChartCard, md } from "./charts";
import type { TabProps } from "./data";
import { FOODS, foodAmount, foodKcal, type Food } from "./foods";
import { plan } from "./math";

/** 饮食：按天看，分四餐；添加时从内置食物或自己记过的里面选，也可以手填 */
const MEALS: { key: Meal; label: string }[] = [
  { key: "breakfast", label: "早餐" },
  { key: "lunch", label: "午餐" },
  { key: "dinner", label: "晚餐" },
  { key: "snack", label: "加餐" },
];
type Mine = { name: string; amount: string; kcal: number };

const shift = (date: string, n: number) => {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + n, 12).toLocaleDateString("sv");
};
/** 按现在几点猜是哪一餐 */
const guessMeal = (): Meal => {
  const h = new Date().getHours();
  return h < 10 ? "breakfast" : h < 15 ? "lunch" : h < 21 ? "dinner" : "snack";
};

// ---------- 添加一样吃的 ----------
function AddDialog({ date, meal: meal0, mine, onClose, onAdded }: { date: string; meal: Meal; mine: Mine[]; onClose: () => void; onAdded: () => void }) {
  const [meal, setMeal] = useState<Meal>(meal0);
  const [q, setQ] = useState("");
  const [picked, setPicked] = useState<Food | null>(null);
  const [qty, setQty] = useState("");
  // 手填（或者从"我记过的"里带出来）的名称、分量、热量
  const [manual, setManual] = useState<{ name: string; amount: string; kcal: string } | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);

  const kw = q.trim().toLowerCase();
  const foods = useMemo(() => FOODS.filter((f) => !kw || f.name.toLowerCase().includes(kw) || f.group.includes(kw)), [kw]);
  const mineShown = useMemo(() => mine.filter((m) => !kw || m.name.toLowerCase().includes(kw)).slice(0, 12), [mine, kw]);
  const groups = useMemo(() => [...new Set(foods.map((f) => f.group))], [foods]);

  const pick = (f: Food) => {
    setPicked(f);
    setManual(null);
    setQty(f.per === "100g" ? "100" : "1");
    setError("");
  };
  const n = Number(qty);
  const kcal = picked && n > 0 ? foodKcal(picked, n) : 0;

  const save = async (e: FormEvent) => {
    e.preventDefault();
    let body: { name: string; amount: string; kcal: number };
    if (picked) {
      if (!(n > 0)) return setError(picked.per === "100g" ? "填一下吃了多少克" : "填一下吃了几份");
      body = { name: picked.name, amount: foodAmount(picked, n), kcal };
    } else if (manual) {
      if (!manual.name.trim()) return setError("写一下吃了什么");
      if (manual.kcal.trim() === "" || !(Number(manual.kcal) >= 0)) return setError("填一下大概多少千卡");
      body = { name: manual.name.trim(), amount: manual.amount.trim(), kcal: Number(manual.kcal) };
    } else return setError("先选一样食物，或者点「手动填写」");
    setSaving(true);
    try {
      await api.post("/fitness/food", { date, meal, ...body });
      toast.success(`已记下：${body.name} ${Math.round(body.kcal)} 千卡`);
      onAdded();
      // 留在弹窗里，方便接着记下一样
      setPicked(null);
      setManual(null);
      setQty("");
      setQ("");
      setError("");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal title={`记饮食 · ${date === today() ? "今天" : md(date)}`} onClose={onClose} wide>
      <form onSubmit={save} className="space-y-4">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="哪一餐">
            {MEALS.map((m) => (
              <button key={m.key} type="button" role="radio" aria-checked={meal === m.key} onClick={() => setMeal(m.key)} className={`cursor-pointer rounded-lg px-3 py-1 transition ${meal === m.key ? "bg-surface font-medium shadow-sm" : "text-slate-600 hover:text-ink"}`}>
                {m.label}
              </button>
            ))}
          </div>
          <div className="relative min-w-40 flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="搜索食物，例如 鸡胸、米饭…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索食物" autoFocus />
          </div>
          <button
            type="button"
            className="btn bg-ink/8 hover:bg-ink/12"
            onClick={() => {
              setPicked(null);
              setManual({ name: q.trim(), amount: "", kcal: "" });
              setError("");
            }}
          >
            手动填写
          </button>
        </div>

        {/* 选中的食物 / 手填 */}
        {picked && (
          <div className="flex flex-wrap items-end gap-3 rounded-2xl bg-brand/10 px-4 py-3">
            <div className="min-w-0 flex-1">
              <div className="truncate text-sm font-medium">{picked.name}</div>
              <div className="mt-0.5 text-xs text-slate-500">
                {picked.per === "100g" ? `每 100 克约 ${picked.kcal} 千卡` : `每${picked.per.split(" ")[0]}约 ${picked.kcal} 千卡${picked.grams ? `（约 ${picked.grams} 克）` : picked.per.includes(" ") ? `（${picked.per.split(" ")[1]}）` : ""}`}
              </div>
            </div>
            <div className="w-28">
              <label className="label" htmlFor="fd-qty">
                {picked.per === "100g" ? "克数" : `几${picked.per.split(" ")[0]}`}
              </label>
              <input id="fd-qty" className="input" type="number" inputMode="decimal" step={picked.per === "100g" ? "10" : "0.5"} min="0" value={qty} onChange={(e) => setQty(e.target.value)} />
            </div>
            <div className="pb-2 text-sm tabular-nums">
              ≈ <span className="text-lg font-medium">{kcal}</span> 千卡
            </div>
          </div>
        )}
        {manual && (
          <div className="grid gap-3 rounded-2xl bg-brand/10 px-4 py-3 sm:grid-cols-[minmax(0,2fr)_minmax(0,1fr)_minmax(0,1fr)]">
            <div>
              <label className="label" htmlFor="fd-name">
                吃了什么
              </label>
              <input id="fd-name" className="input" value={manual.name} onChange={(e) => setManual({ ...manual, name: e.target.value })} placeholder="例如 公司食堂的套餐" />
            </div>
            <div>
              <label className="label" htmlFor="fd-amount">
                分量（可不填）
              </label>
              <input id="fd-amount" className="input" value={manual.amount} onChange={(e) => setManual({ ...manual, amount: e.target.value })} placeholder="例如 1 份" />
            </div>
            <div>
              <label className="label" htmlFor="fd-kcal">
                热量（千卡）
              </label>
              <input id="fd-kcal" className="input" type="number" inputMode="numeric" min="0" value={manual.kcal} onChange={(e) => setManual({ ...manual, kcal: e.target.value })} />
            </div>
          </div>
        )}

        {/* 可以选的食物 */}
        <div className="max-h-[42vh] space-y-3 overflow-y-auto pr-1">
          {mineShown.length > 0 && (
            <div>
              <div className="mb-1.5 text-xs font-medium text-slate-500">我记过的</div>
              <div className="flex flex-wrap gap-1.5">
                {mineShown.map((m) => (
                  <button
                    key={`${m.name}|${m.amount}|${m.kcal}`}
                    type="button"
                    className="chip"
                    onClick={() => {
                      setPicked(null);
                      setManual({ name: m.name, amount: m.amount, kcal: String(m.kcal) });
                      setError("");
                    }}
                  >
                    {m.name}
                    {m.amount && ` ${m.amount}`} · {Math.round(m.kcal)}
                  </button>
                ))}
              </div>
            </div>
          )}
          {groups.map((g) => (
            <div key={g}>
              <div className="mb-1.5 text-xs font-medium text-slate-500">{g}</div>
              <div className="flex flex-wrap gap-1.5">
                {foods
                  .filter((f) => f.group === g)
                  .map((f) => (
                    <button key={f.name} type="button" className={picked?.name === f.name ? "chip-on" : "chip"} onClick={() => pick(f)}>
                      {f.name}
                    </button>
                  ))}
              </div>
            </div>
          ))}
          {foods.length === 0 && mineShown.length === 0 && <p className="py-4 text-center text-sm text-slate-400">没有找到「{q.trim()}」。点上面的「手动填写」，自己填名称和热量。</p>}
        </div>

        <ErrorText msg={error} />
        <div className="flex justify-end gap-2">
          <button type="button" className="btn-ghost" onClick={onClose}>
            完成
          </button>
          <button className="btn-primary" disabled={saving}>
            <Plus className="size-4" /> 记下这一样
          </button>
        </div>
      </form>
    </Modal>
  );
}

export default function FoodTab({ overview: o, reload }: TabProps) {
  const [date, setDate] = useState(today());
  const [list, setList] = useState<FoodLog[] | null>(null);
  const [mine, setMine] = useState<Mine[]>([]);
  const [adding, setAdding] = useState<Meal | null>(null);
  const [hover, setHover] = useState<number | null>(null);

  const load = (d: string) => api.get<FoodLog[]>(`/fitness/food?date=${d}`).then((got) => setList(got), (err) => toast.error((err as Error).message));
  const loadMine = () => api.get<Mine[]>("/fitness/food/mine").then(setMine, () => {});
  useEffect(() => {
    setList(null);
    load(date);
  }, [date]);
  useEffect(() => {
    loadMine();
  }, []);
  const changed = () => {
    load(date);
    loadMine();
    reload();
  };

  const remove = async (f: FoodLog) => {
    try {
      await api.del(`/fitness/food/${f.id}`);
      changed();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // 建议摄入：要有资料和体重才算得出来
  const target = o.profile && o.latest ? plan(o.profile, o.latest.weight).intake : null;
  const total = Math.round((list ?? []).reduce((n, f) => n + f.kcal, 0));
  const over = target !== null ? total - target : 0;
  const bars = o.intake14.map((d) => ({
    key: d.date,
    value: d.kcal,
    label: `${md(d.date)} ${d.kcal ? `${d.kcal} 千卡${target !== null ? (d.kcal > target ? `，超出 ${d.kcal - target}` : `，低于建议 ${target - d.kcal}`) : ""}` : "没有记"}`,
  }));

  return (
    <div className="space-y-4">
      {/* 哪一天 + 当天合计 */}
      <section className="card px-5">
        <div className="flex flex-wrap items-center gap-3">
          <div className="flex items-center gap-1">
            <button className="btn-ghost p-2" onClick={() => setDate(shift(date, -1))} aria-label="前一天" title="前一天">
              <ChevronLeft className="size-4" />
            </button>
            <input className="input w-auto" type="date" max={today()} value={date} onChange={(e) => e.target.value && setDate(e.target.value)} aria-label="日期" />
            <button className="btn-ghost p-2" onClick={() => setDate(shift(date, 1))} disabled={date >= today()} aria-label="后一天" title="后一天">
              <ChevronRight className="size-4" />
            </button>
            {date !== today() && (
              <button className="btn-ghost" onClick={() => setDate(today())}>
                回到今天
              </button>
            )}
          </div>
          <button className="btn-primary ml-auto" onClick={() => setAdding(guessMeal())}>
            <Plus className="size-4" /> 记一样吃的
          </button>
        </div>
        <div className="mt-4 flex items-baseline gap-2">
          <span className="font-display text-[2rem] font-extralight leading-none tabular-nums">{total}</span>
          <span className="text-sm text-slate-500">{target !== null ? `/ ${target} 千卡` : "千卡"}</span>
          {target !== null && total > 0 && <span className={`ml-auto text-xs ${over > 0 ? "font-medium text-red-600" : "text-slate-500"}`}>{over > 0 ? `超出 ${over} 千卡` : `还可以吃 ${-over} 千卡`}</span>}
        </div>
        {target !== null ? (
          <div className="mt-3 h-2.5 overflow-hidden rounded-full bg-ink/10" role="progressbar" aria-valuemin={0} aria-valuemax={target} aria-valuenow={total} aria-label="这一天已经吃的热量">
            <div className={`h-full rounded-full transition-[width] ${over > 0 ? "bg-red-500" : "bg-brand"}`} style={{ width: `${Math.min(100, (total / target) * 100)}%` }} />
          </div>
        ) : (
          <p className="mt-2 text-xs text-slate-500">在「概览」里填好资料并记一次体重，这里就会显示每天建议吃多少。</p>
        )}
      </section>

      {/* 四餐 */}
      {list === null ? (
        <div className="card h-40 animate-pulse" />
      ) : (
        <div className="grid gap-4 md:grid-cols-2">
          {MEALS.map((m) => {
            const items = list.filter((f) => f.meal === m.key);
            const sum = Math.round(items.reduce((n, f) => n + f.kcal, 0));
            return (
              <section key={m.key} className="card px-5">
                <div className="mb-1 flex items-baseline justify-between">
                  <h2 className="text-sm font-medium">
                    {m.label}
                    {sum > 0 && <span className="ml-2 font-normal tabular-nums text-slate-500">{sum} 千卡</span>}
                  </h2>
                  <button className="cursor-pointer text-xs text-slate-500 underline-offset-4 hover:text-ink hover:underline" onClick={() => setAdding(m.key)}>
                    + 添加
                  </button>
                </div>
                {items.length === 0 ? (
                  <p className="border-t border-line py-3 text-sm text-slate-400">还没有记。</p>
                ) : (
                  <ul className="divide-y divide-line border-t border-line">
                    {items.map((f) => (
                      <li key={f.id} className="group flex items-center gap-3 py-2 text-sm">
                        <span className="min-w-0 flex-1 truncate">
                          {f.name}
                          {f.amount && <span className="ml-2 text-xs text-slate-500">{f.amount}</span>}
                        </span>
                        <span className="shrink-0 tabular-nums text-slate-600">{Math.round(f.kcal)}</span>
                        <button className="btn-danger shrink-0 p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="删除" aria-label={`删除 ${f.name}`} onClick={() => remove(f)}>
                          <Trash2 className="size-3.5" />
                        </button>
                      </li>
                    ))}
                  </ul>
                )}
              </section>
            );
          })}
        </div>
      )}

      <ChartCard title="最近 14 天的摄入" hint={target !== null ? `虚线是建议摄入 ${target} 千卡` : "每天吃了多少千卡"} readout={hover !== null ? bars[hover].label : ""}>
        <BarChart bars={bars} reference={target ?? undefined} firstLabel={md(o.intake14[0].date)} lastLabel="今天" onHover={setHover} />
      </ChartCard>

      {adding && <AddDialog date={date} meal={adding} mine={mine} onClose={() => setAdding(null)} onAdded={changed} />}
    </div>
  );
}
