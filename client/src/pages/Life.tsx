import { useEffect, useMemo, useState, type FormEvent } from "react";
import { api, type Expense, type LifeItem, today } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";

const LIFE_CATS = ["购物", "健康", "家务", "社交", "学习", "其他"];
const EXP_CATS = ["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "工资", "其他"];

export default function Life() {
  const [tab, setTab] = useState<"list" | "money">("list");
  return (
    <div>
      <PageHeader
        title="🌿 生活"
        action={
          <div className="flex rounded-lg bg-stone-200 p-1 text-sm">
            {(["list", "money"] as const).map((k) => (
              <button
                key={k}
                className={`rounded-md px-3 py-1 transition ${tab === k ? "bg-white shadow-sm" : "text-stone-600"}`}
                onClick={() => setTab(k)}
              >
                {k === "list" ? "📋 生活清单" : "💰 记账"}
              </button>
            ))}
          </div>
        }
      />
      {tab === "list" ? <LifeList /> : <Money />}
    </div>
  );
}

// ---------------- 生活清单 ----------------
function LifeList() {
  const [items, setItems] = useState<LifeItem[]>([]);
  const [filter, setFilter] = useState("全部");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("其他");
  const [date, setDate] = useState("");
  const [error, setError] = useState("");

  const load = () => api.get<LifeItem[]>("/life").then(setItems);
  useEffect(() => {
    load();
  }, []);

  const add = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    try {
      await api.post("/life", { title, category, date: date || null });
      setTitle("");
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const toggle = async (it: LifeItem) => {
    setItems((xs) => xs.map((x) => (x.id === it.id ? { ...x, done: !x.done } : x)));
    await api.put(`/life/${it.id}`, { done: !it.done });
    load();
  };

  const remove = async (it: LifeItem) => {
    await api.del(`/life/${it.id}`);
    load();
  };

  const shown = filter === "全部" ? items : items.filter((i) => i.category === filter);
  const t0 = today();

  return (
    <div className="space-y-4">
      <form onSubmit={add} className="card flex flex-wrap gap-2">
        <input className="input min-w-48 flex-1" placeholder="要做点什么？例如：买牛奶、去健身房…" value={title} onChange={(e) => setTitle(e.target.value)} />
        <select className="input w-28" value={category} onChange={(e) => setCategory(e.target.value)}>
          {LIFE_CATS.map((c) => <option key={c}>{c}</option>)}
        </select>
        <input className="input w-40" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        <button className="btn-primary">添加</button>
        <div className="w-full"><ErrorText msg={error} /></div>
      </form>

      <div className="flex flex-wrap gap-2">
        {["全部", ...LIFE_CATS].map((c) => (
          <button
            key={c}
            onClick={() => setFilter(c)}
            className={`rounded-full px-3 py-1 text-xs transition ${filter === c ? "bg-emerald-600 text-white" : "bg-white text-stone-600 ring-1 ring-stone-200 hover:bg-stone-100"}`}
          >
            {c}
          </button>
        ))}
      </div>

      <ul className="card divide-y divide-stone-100 p-0">
        {shown.length === 0 && <li className="p-6 text-center text-sm text-stone-400">清单是空的 🎉</li>}
        {shown.map((it) => (
          <li key={it.id} className="group flex items-center gap-3 px-4 py-3">
            <input type="checkbox" className="size-4 accent-emerald-600" checked={it.done} onChange={() => toggle(it)} />
            <span className={`flex-1 text-sm ${it.done ? "text-stone-400 line-through" : ""}`}>{it.title}</span>
            <span className="rounded bg-emerald-50 px-1.5 py-0.5 text-xs text-emerald-700">{it.category}</span>
            {it.date && (
              <span className={`text-xs ${!it.done && it.date < t0 ? "text-red-600" : it.date === t0 ? "font-medium text-emerald-700" : "text-stone-500"}`}>
                {it.date === t0 ? "今天" : it.date}
              </span>
            )}
            <button className="btn-danger px-2 py-1 text-xs md:opacity-0 md:group-hover:opacity-100" onClick={() => remove(it)}>
              删除
            </button>
          </li>
        ))}
      </ul>
    </div>
  );
}

// ---------------- 记账 ----------------
type ExpDraft = Omit<Expense, "id">;

function Money() {
  const [list, setList] = useState<Expense[]>([]);
  const [month, setMonth] = useState(today().slice(0, 7));
  const [editing, setEditing] = useState<{ id?: number; draft: ExpDraft } | null>(null);
  const [error, setError] = useState("");

  const load = () => api.get<Expense[]>("/expenses").then(setList);
  useEffect(() => {
    load();
  }, []);

  const monthList = useMemo(() => list.filter((x) => x.date.startsWith(month)), [list, month]);
  const income = monthList.filter((x) => x.type === "income").reduce((s, x) => s + x.amount, 0);
  const expense = monthList.filter((x) => x.type === "expense").reduce((s, x) => s + x.amount, 0);

  const byCat = useMemo(() => {
    const m = new Map<string, number>();
    monthList.filter((x) => x.type === "expense").forEach((x) => m.set(x.category, (m.get(x.category) ?? 0) + x.amount));
    return [...m.entries()].sort((a, b) => b[1] - a[1]);
  }, [monthList]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    try {
      if (editing.id) await api.put(`/expenses/${editing.id}`, editing.draft);
      else await api.post("/expenses", editing.draft);
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    }
  };

  const remove = async (x: Expense) => {
    if (!confirm("删除这条记录？")) return;
    await api.del(`/expenses/${x.id}`);
    load();
  };

  const set = <K extends keyof ExpDraft>(k: K, v: ExpDraft[K]) =>
    setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <input className="input w-44" type="month" value={month} onChange={(e) => setMonth(e.target.value)} />
        <button
          className="btn-primary ml-auto"
          onClick={() => { setError(""); setEditing({ draft: { type: "expense", amount: 0, category: "餐饮", note: "", date: today() } }); }}
        >
          + 记一笔
        </button>
      </div>

      <div className="grid grid-cols-3 gap-4">
        <div className="card"><div className="text-xs text-stone-500">收入</div><div className="mt-1 text-xl font-bold text-emerald-600">+{income.toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-stone-500">支出</div><div className="mt-1 text-xl font-bold text-red-600">-{expense.toFixed(2)}</div></div>
        <div className="card"><div className="text-xs text-stone-500">结余</div><div className="mt-1 text-xl font-bold">{(income - expense).toFixed(2)}</div></div>
      </div>

      {byCat.length > 0 && (
        <div className="card space-y-2">
          <h3 className="text-sm font-semibold">支出分类</h3>
          {byCat.map(([cat, amt]) => (
            <div key={cat} className="flex items-center gap-3 text-sm">
              <span className="w-12 shrink-0 text-stone-600">{cat}</span>
              <div className="h-2 flex-1 rounded-full bg-stone-100">
                <div className="h-2 rounded-full bg-sky-500" style={{ width: `${(amt / expense) * 100}%` }} />
              </div>
              <span className="w-20 shrink-0 text-right tabular-nums text-stone-600">{amt.toFixed(2)}</span>
            </div>
          ))}
        </div>
      )}

      <ul className="card divide-y divide-stone-100 p-0">
        {monthList.length === 0 && <li className="p-6 text-center text-sm text-stone-400">本月还没有记录</li>}
        {monthList.map((x) => (
          <li key={x.id} className="group flex items-center gap-3 px-4 py-3 text-sm">
            <span className="w-24 shrink-0 text-xs text-stone-500">{x.date}</span>
            <span className="rounded bg-stone-100 px-1.5 py-0.5 text-xs">{x.category}</span>
            <span className="flex-1 truncate text-stone-600">{x.note}</span>
            <span className={`tabular-nums font-medium ${x.type === "income" ? "text-emerald-600" : "text-red-600"}`}>
              {x.type === "income" ? "+" : "-"}{x.amount.toFixed(2)}
            </span>
            <span className="flex gap-1 md:opacity-0 md:group-hover:opacity-100">
              <button className="btn-ghost px-2 py-1 text-xs" onClick={() => { setError(""); setEditing({ id: x.id, draft: { ...x } }); }}>编辑</button>
              <button className="btn-danger px-2 py-1 text-xs" onClick={() => remove(x)}>删除</button>
            </span>
          </li>
        ))}
      </ul>

      {editing && (
        <Modal title={editing.id ? "编辑记录" : "记一笔"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <div className="flex rounded-lg bg-stone-100 p-1 text-sm">
              {(["expense", "income"] as const).map((t) => (
                <button
                  type="button"
                  key={t}
                  className={`flex-1 rounded-md py-1.5 transition ${editing.draft.type === t ? "bg-white shadow-sm" : "text-stone-500"}`}
                  onClick={() => set("type", t)}
                >
                  {t === "expense" ? "支出" : "收入"}
                </button>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label">金额</label>
                <input className="input" type="number" step="0.01" min="0" value={editing.draft.amount || ""} onChange={(e) => set("amount", Number(e.target.value))} autoFocus />
              </div>
              <div>
                <label className="label">日期</label>
                <input className="input" type="date" value={editing.draft.date} onChange={(e) => set("date", e.target.value)} />
              </div>
            </div>
            <div>
              <label className="label">分类</label>
              <select className="input" value={editing.draft.category} onChange={(e) => set("category", e.target.value)}>
                {EXP_CATS.map((c) => <option key={c}>{c}</option>)}
              </select>
            </div>
            <div>
              <label className="label">备注</label>
              <input className="input" value={editing.draft.note} onChange={(e) => set("note", e.target.value)} />
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
