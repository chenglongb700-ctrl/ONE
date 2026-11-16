import { useEffect, useState, type FormEvent } from "react";
import { RefreshCw, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today } from "../api";
import { metOf, WORKOUT_TYPES } from "../fitness/exercises";
import { burned } from "../fitness/math";
import Modal from "./Modal";

/**
 * 「记一笔」：用大白话写今天做了什么、吃了什么、要做什么，AI 拆成一条条待确认的记录。
 * AI 只是提建议——列表里每一条都可以改、可以取消勾选，点「保存选中的」才真正写入，
 * 写入走的是各功能自己的接口，校验规则和手动录入完全一样。
 */
export const DATA_CHANGED_EVENT = "one:data-changed"; // 保存后发这个事件，Layout 收到会让当前页面重新读数据

/** 没配模型时各个 AI 入口共用的提示 */
export function AiSetupHint() {
  return (
    <div className="rounded-2xl bg-ink/5 px-4 py-4 text-sm leading-7">
      <p className="font-medium">还没有配置 AI 模型</p>
      <p className="mt-1 text-slate-600">
        在项目文件夹里把 <code className="font-mono text-[13px]">.env.example</code> 复制一份，改名为 <code className="font-mono text-[13px]">.env</code>，填上接口地址、密钥和模型名，然后重启网站。其他功能不受影响。
      </p>
    </div>
  );
}

type Kind = "task" | "life" | "expense" | "journal" | "body" | "food" | "workout" | "strength";
/** 服务器给的一条建议：type 加上这种记录的字段 */
type Suggestion = { type: Kind } & Record<string, string | number | null>;
/** 列表里的一条：字段都存成文字方便编辑，保存时再转成数字 */
type Item = { key: number; type: Kind; on: boolean; v: Record<string, string>; error?: string };

type Field = { key: string; label: string; kind: "text" | "number" | "date" | "select" | "textarea"; options?: [string, string][]; grow?: boolean; optional?: boolean };
const opts = (list: string[]): [string, string][] => list.map((x) => [x, x]);

// 每种记录：叫什么、存到哪、有哪些字段可以改
const KINDS: Record<Kind, { label: string; where: string; fields: Field[] }> = {
  task: {
    label: "任务",
    where: "工作 › 待办",
    fields: [
      { key: "title", label: "标题", kind: "text", grow: true },
      { key: "due_date", label: "截止日期", kind: "date", optional: true },
      { key: "priority", label: "优先级", kind: "select", options: [["high", "高"], ["medium", "中"], ["low", "低"]] },
    ],
  },
  life: {
    label: "生活清单",
    where: "生活 › 清单",
    fields: [
      { key: "title", label: "内容", kind: "text", grow: true },
      { key: "category", label: "分类", kind: "select", options: opts(["购物", "健康", "家务", "社交", "学习", "其他"]) },
      { key: "date", label: "日期", kind: "date", optional: true },
    ],
  },
  expense: {
    label: "记账",
    where: "生活 › 记账",
    fields: [
      { key: "kind", label: "收支", kind: "select", options: [["expense", "支出"], ["income", "收入"]] },
      { key: "amount", label: "金额（元）", kind: "number" },
      { key: "category", label: "分类", kind: "select", options: opts(["餐饮", "交通", "购物", "居住", "娱乐", "医疗", "工资", "其他"]) },
      { key: "note", label: "备注", kind: "text", grow: true, optional: true },
      { key: "date", label: "日期", kind: "date" },
    ],
  },
  journal: {
    label: "随记",
    where: "随记",
    fields: [
      { key: "title", label: "标题", kind: "text", grow: true },
      { key: "mood", label: "心情", kind: "select", options: opts(["😊", "😄", "🥰", "😌", "😐", "🤔", "😔", "😢", "😤", "😴"]) },
      { key: "date", label: "日期", kind: "date" },
      { key: "content", label: "正文", kind: "textarea", optional: true },
    ],
  },
  body: {
    label: "体重",
    where: "健身 › 体重",
    fields: [
      { key: "date", label: "日期", kind: "date" },
      { key: "weight", label: "体重（公斤）", kind: "number" },
      { key: "waist", label: "腰围（厘米）", kind: "number", optional: true },
      { key: "body_fat", label: "体脂率（%）", kind: "number", optional: true },
    ],
  },
  food: {
    label: "饮食",
    where: "健身 › 饮食",
    fields: [
      { key: "meal", label: "哪一餐", kind: "select", options: [["breakfast", "早餐"], ["lunch", "午餐"], ["dinner", "晚餐"], ["snack", "加餐"]] },
      { key: "name", label: "吃了什么", kind: "text", grow: true },
      { key: "amount", label: "分量", kind: "text", optional: true },
      { key: "kcal", label: "千卡（AI 估算）", kind: "number" },
      { key: "date", label: "日期", kind: "date" },
    ],
  },
  workout: {
    label: "运动",
    where: "健身 › 运动",
    fields: [
      { key: "workout", label: "类型", kind: "select", options: opts(WORKOUT_TYPES.map((t) => t.name)) },
      { key: "minutes", label: "时长（分钟）", kind: "number" },
      { key: "note", label: "备注", kind: "text", grow: true, optional: true },
      { key: "date", label: "日期", kind: "date" },
    ],
  },
  strength: {
    label: "力量训练",
    where: "健身 › 力量",
    fields: [
      { key: "exercise", label: "动作", kind: "text", grow: true },
      { key: "weight", label: "重量（公斤）", kind: "number" },
      { key: "reps", label: "每组次数", kind: "number" },
      { key: "sets", label: "组数", kind: "number" },
      { key: "date", label: "日期", kind: "date" },
    ],
  },
};

const EXAMPLE = "早上称了 74.1；中午吃了黄焖鸡米饭，花了 28；晚上跑步 30 分钟；明天下午前把季度报告交了";

export default function AiCapture({ onClose }: { onClose: () => void }) {
  const [configured, setConfigured] = useState<boolean | null>(null);
  const [text, setText] = useState("");
  const [items, setItems] = useState<Item[] | null>(null); // null = 还没让 AI 拆过
  const [dropped, setDropped] = useState(0);
  const [busy, setBusy] = useState<"parse" | "save" | null>(null);
  const [error, setError] = useState("");

  useEffect(() => {
    api.get<{ configured: boolean }>("/ai/status").then(
      (s) => setConfigured(s.configured),
      () => setConfigured(false),
    );
  }, []);

  const parse = async (e: FormEvent) => {
    e.preventDefault();
    if (text.trim().length < 2) return setError("先写点什么");
    setBusy("parse");
    setError("");
    try {
      const got = await api.post<{ items: Suggestion[]; dropped: number }>("/ai/parse", { text });
      setItems(
        got.items.map((s, i) => {
          const { type, ...rest } = s;
          // 工作里这个字段在服务器上叫 workout，运动类型不在清单里的归到"其他"
          const v = Object.fromEntries(Object.entries(rest).map(([k, val]) => [k, val === null ? "" : String(val)]));
          if (type === "workout" && !WORKOUT_TYPES.some((t) => t.name === v.workout)) v.workout = "其他";
          return { key: Date.now() + i, type, on: true, v };
        }),
      );
      setDropped(got.dropped);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(null);
    }
  };

  const patch = (key: number, p: Partial<Item>) => setItems((list) => list && list.map((it) => (it.key === key ? { ...it, ...p } : it)));
  const setField = (it: Item, k: string, val: string) => patch(it.key, { v: { ...it.v, [k]: val }, error: undefined });

  /** 把一条记录存到它该去的地方。字段不对时抛出能给用户看的错误 */
  const saveOne = async (it: Item, weight: number | null) => {
    const v = it.v;
    const n = (k: string) => Number(v[k]);
    const nOrNull = (k: string) => (v[k]?.trim() ? Number(v[k]) : null);
    const need = (k: string, what: string) => {
      if (!v[k]?.trim()) throw new Error(`${what}没有填`);
    };
    switch (it.type) {
      case "task":
        need("title", "标题");
        return api.post("/tasks", { title: v.title, description: "", status: "todo", priority: v.priority || "medium", due_date: v.due_date || null });
      case "life":
        need("title", "内容");
        return api.post("/life", { title: v.title, category: v.category || "其他", done: false, date: v.date || null });
      case "expense":
        if (!(n("amount") > 0)) throw new Error("金额要大于 0");
        return api.post("/expenses", { type: v.kind || "expense", amount: n("amount"), category: v.category || "其他", note: v.note ?? "", date: v.date || today() });
      case "journal":
        need("title", "标题");
        return api.post("/journals", { title: v.title, content: v.content ?? "", mood: v.mood || "😊", tags: "", date: v.date || today() });
      case "body":
        if (!(n("weight") > 0)) throw new Error("体重没有填");
        return api.post("/fitness/body", { date: v.date || today(), weight: n("weight"), waist: nOrNull("waist"), body_fat: nOrNull("body_fat"), note: "" });
      case "food":
        need("name", "食物名");
        if (v.kcal?.trim() === "" || !(n("kcal") >= 0)) throw new Error("热量没有填");
        return api.post("/fitness/food", { date: v.date || today(), meal: v.meal || "snack", name: v.name, amount: v.amount ?? "", kcal: n("kcal") });
      case "workout":
        if (!(n("minutes") > 0)) throw new Error("时长没有填");
        // 消耗的热量不让 AI 猜：有体重记录就按公式估，没有就先记 0
        return api.post("/fitness/workouts", { date: v.date || today(), type: v.workout || "其他", minutes: n("minutes"), kcal: weight ? burned(metOf(v.workout), weight, n("minutes")) : 0, note: v.note ?? "" });
      case "strength":
        need("exercise", "动作");
        if (!(n("reps") > 0) || !(n("sets") > 0)) throw new Error("次数和组数都要填");
        return api.post("/fitness/strength", { date: v.date || today(), exercise: v.exercise, weight: v.weight?.trim() ? n("weight") : 0, reps: n("reps"), sets: n("sets") });
    }
  };

  const save = async () => {
    if (!items) return;
    const picked = items.filter((it) => it.on);
    if (picked.length === 0) return setError("没有勾选任何一条");
    setBusy("save");
    setError("");
    // 估算运动消耗要用最近一次的体重；如果这一批里就有今天的体重，用它
    let weight: number | null = Number(picked.find((it) => it.type === "body")?.v.weight) || null;
    if (!weight && picked.some((it) => it.type === "workout")) {
      weight = await api.get<{ latest: { weight: number } | null }>("/fitness/overview").then(
        (o) => o.latest?.weight ?? null,
        () => null,
      );
    }
    let saved = 0;
    const failed: Item[] = [];
    // 体重先存（后面的运动要用），其余按顺序一条条存；哪条失败就留在列表里并写明原因
    for (const it of [...picked].sort((a, b) => Number(b.type === "body") - Number(a.type === "body"))) {
      try {
        await saveOne(it, weight);
        saved++;
      } catch (err) {
        failed.push({ ...it, error: (err as Error).message });
      }
    }
    setBusy(null);
    if (saved > 0) {
      toast.success(`已保存 ${saved} 条${failed.length ? `，还有 ${failed.length} 条没存上` : ""}`);
      window.dispatchEvent(new CustomEvent(DATA_CHANGED_EVENT));
    }
    if (failed.length === 0) return onClose();
    // 留下没存上的和没勾选的
    const failedKeys = new Map(failed.map((f) => [f.key, f]));
    setItems(items.filter((it) => !it.on || failedKeys.has(it.key)).map((it) => failedKeys.get(it.key) ?? it));
    setError("有几条没存上，原因写在每条下面，改好后可以再存一次。");
  };

  const count = items?.filter((it) => it.on).length ?? 0;

  return (
    <Modal title="记一笔" onClose={onClose} wide>
      {configured === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : !configured ? (
        <AiSetupHint />
      ) : (
        <div className="space-y-4">
          <form onSubmit={parse}>
            <label className="label" htmlFor="cap-text">
              用大白话写下来：做了什么、吃了什么、花了什么、接下来要做什么
            </label>
            <textarea id="cap-text" className="input min-h-24" placeholder={`例如：${EXAMPLE}`} value={text} onChange={(e) => setText(e.target.value)} maxLength={2000} autoFocus />
            <div className="mt-2 flex flex-wrap items-center gap-3">
              <p className="min-w-0 flex-1 text-xs text-slate-500">这段话会发给你配置的 AI 模型。它拆出来的只是建议，下面确认后才会保存。</p>
              <button className={items === null ? "btn-primary" : "btn bg-ink/8 hover:bg-ink/12"} disabled={busy !== null}>
                {busy === "parse" ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
                {busy === "parse" ? "正在拆…" : items === null ? "让 AI 拆一下" : "重新拆"}
              </button>
            </div>
          </form>

          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

          {items !== null &&
            (items.length === 0 ? (
              <p className="rounded-2xl bg-ink/5 px-4 py-8 text-center text-sm text-slate-500">AI 没有从这段话里看出可以记的东西。写得具体一点再试，比如带上数字和时间。</p>
            ) : (
              <>
                <ul className="max-h-[46vh] space-y-2.5 overflow-y-auto pr-1">
                  {items.map((it) => {
                    const K = KINDS[it.type];
                    return (
                      <li key={it.key} className={`rounded-2xl border px-3.5 py-3 transition ${it.on ? "border-line bg-ink/[0.04]" : "border-transparent bg-ink/[0.02] opacity-60"}`}>
                        <div className="flex items-center gap-2.5">
                          <input type="checkbox" checked={it.on} onChange={(e) => patch(it.key, { on: e.target.checked })} aria-label={`保存这条${K.label}`} />
                          <span className="tag">{K.label}</span>
                          <span className="text-xs text-slate-500">存到 {K.where}</span>
                          <button className="btn-ghost ml-auto p-1.5" title="不要这一条" aria-label="不要这一条" onClick={() => setItems(items.filter((x) => x.key !== it.key))}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </div>
                        <div className="mt-2.5 flex flex-wrap items-end gap-2">
                          {K.fields.map((f) => {
                            const id = `cap-${it.key}-${f.key}`;
                            const common = { id, className: "input py-1.5", value: it.v[f.key] ?? "", disabled: !it.on };
                            return (
                              <div key={f.key} className={f.kind === "textarea" ? "w-full" : f.grow ? "min-w-40 flex-1" : f.kind === "date" ? "w-36" : "w-28"}>
                                <label className="mb-1 block text-[11px] text-slate-500" htmlFor={id}>
                                  {f.label}
                                  {f.optional && "（可空）"}
                                </label>
                                {f.kind === "select" ? (
                                  <select {...common} onChange={(e) => setField(it, f.key, e.target.value)}>
                                    {f.options!.map(([val, label]) => (
                                      <option key={val} value={val}>
                                        {label}
                                      </option>
                                    ))}
                                  </select>
                                ) : f.kind === "textarea" ? (
                                  <textarea {...common} className="input min-h-16 py-1.5" onChange={(e) => setField(it, f.key, e.target.value)} />
                                ) : (
                                  <input {...common} type={f.kind} inputMode={f.kind === "number" ? "decimal" : undefined} step={f.kind === "number" ? "any" : undefined} onChange={(e) => setField(it, f.key, e.target.value)} />
                                )}
                              </div>
                            );
                          })}
                        </div>
                        {it.error && <p className="mt-2 text-xs text-red-600">没存上：{it.error}</p>}
                      </li>
                    );
                  })}
                </ul>
                {dropped > 0 && <p className="text-xs text-slate-500">另有 {dropped} 条 AI 给的内容不合规范（比如数字离谱或类型不认识），已经丢掉。</p>}
                <div className="flex items-center justify-end gap-2">
                  <button className="btn-ghost" onClick={onClose}>
                    取消
                  </button>
                  <button className="btn-primary" onClick={save} disabled={busy !== null || count === 0}>
                    {busy === "save" ? "正在保存…" : `保存选中的 ${count} 条`}
                  </button>
                </div>
              </>
            ))}
        </div>
      )}
    </Modal>
  );
}
