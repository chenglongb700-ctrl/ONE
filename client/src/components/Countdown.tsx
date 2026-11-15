import { useEffect, useState, type FormEvent } from "react";
import { ArrowLeft, Hourglass, Pencil, Pin, Plus, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, today, type Countdown } from "../api";
import Modal, { ErrorText } from "./Modal";
import { confirmDialog } from "./Confirm";

const DAY = 86_400_000;

/** 目标时刻。没填时间的按当天 0 点算（只用来排序，显示时按"差几天"算） */
const targetOf = (c: Pick<Countdown, "date" | "time">) => new Date(`${c.date}T${c.time || "00:00"}:00`);
const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
const pad = (n: number) => String(n).padStart(2, "0");

type View = {
  /** 目标已经过去 */
  past: boolean;
  /** "还有" / "已过" / "就是" */
  lead: string;
  value: string;
  unit: string;
  /** 正在按秒跳（不到一天、而且填了时间） */
  ticking: boolean;
};

/**
 * 算出要显示的文字。
 *   只有日期：按日历上差几天算，"还有 23 天"；当天显示"就是今天"；过去的显示"已过 5 天"
 *   带时间：  一天以上显示"3 天 4 小时"；不到一天变成 05:32:10，每秒跳一次
 */
function viewOf(c: Countdown, now: Date): View {
  const target = targetOf(c);
  if (!c.time) {
    const days = Math.round((startOfDay(target) - startOfDay(now)) / DAY); // round：夏令时那天不是整 24 小时
    if (days === 0) return { past: false, lead: "就是", value: "今天", unit: "", ticking: false };
    return { past: days < 0, lead: days > 0 ? "还有" : "已过", value: String(Math.abs(days)), unit: "天", ticking: false };
  }
  const diff = target.getTime() - now.getTime();
  const past = diff < 0;
  const lead = past ? "已过" : "还有";
  const ms = Math.abs(diff);
  if (ms >= DAY) {
    const hours = Math.floor((ms % DAY) / 3_600_000);
    return { past, lead, value: String(Math.floor(ms / DAY)), unit: hours ? `天 ${hours} 小时` : "天", ticking: false };
  }
  const s = Math.floor(ms / 1000);
  return { past, lead, value: `${pad(Math.floor(s / 3600))}:${pad(Math.floor((s % 3600) / 60))}:${pad(s % 60)}`, unit: "", ticking: true };
}

const dateText = (c: Countdown) =>
  new Intl.DateTimeFormat("zh-CN", { year: "numeric", month: "long", day: "numeric", weekday: "short" }).format(targetOf(c)) + (c.time ? ` ${c.time}` : "");

type Draft = { id?: number; title: string; date: string; time: string; pinned: boolean };

/**
 * 右上角的倒计时。平时是一枚小胶囊，显示一个倒计时；点开是全部倒计时的列表，可以添加、修改、删除。
 * 显示哪一个：固定了的优先；没有固定的，显示最近要到的那个；全都过去了，显示刚过去的那个。
 */
export default function CountdownCorner() {
  const [list, setList] = useState<Countdown[] | null>(null);
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState<Draft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [now, setNow] = useState(() => new Date());

  const load = () =>
    api
      .get<Countdown[]>("/countdowns")
      .then(setList)
      .catch(() => setList([]));
  useEffect(() => {
    load();
  }, []);

  const all = list ?? [];
  const views = new Map(all.map((c) => [c.id, viewOf(c, now)]));
  // 服务器已经按目标时间从早到晚排好：还没到的保持这个顺序，过去的倒过来（刚过去的在前）
  const upcoming = all.filter((c) => !views.get(c.id)!.past);
  const passed = all.filter((c) => views.get(c.id)!.past).reverse();
  const featured = all.find((c) => c.pinned) ?? upcoming[0] ?? passed[0];

  // 有按秒跳的就每秒刷新；否则半分钟看一眼就够（跨过零点、或者进入最后一天时能跟上）
  const fast = all.some((c) => c.time && Math.abs(targetOf(c).getTime() - now.getTime()) < DAY + 60_000);
  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), fast ? 1000 : 30_000);
    return () => clearInterval(id);
  }, [fast]);

  const close = () => {
    setOpen(false);
    setDraft(null);
  };

  const startAdd = () => {
    setError("");
    setDraft({ title: "", date: "", time: "", pinned: false });
  };

  const startEdit = (c: Countdown) => {
    setError("");
    setDraft({ id: c.id, title: c.title, date: c.date, time: c.time, pinned: c.pinned });
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError("");
    if (!draft.title.trim()) return setError("请填写名称，比如「考试」");
    if (!draft.date) return setError("请选择日期");
    setSaving(true);
    try {
      const { id, ...body } = draft;
      if (id) await api.put(`/countdowns/${id}`, body);
      else await api.post("/countdowns", body);
      toast.success(id ? "已保存修改" : "已添加");
      setDraft(null);
      setNow(new Date());
      await load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const togglePin = async (c: Countdown) => {
    try {
      await api.put(`/countdowns/${c.id}`, { pinned: !c.pinned });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (c: Countdown) => {
    if (!(await confirmDialog({ title: "删除这个倒计时？", message: `「${c.title}」删除后无法恢复。` }))) return;
    try {
      await api.del(`/countdowns/${c.id}`);
      toast.success("已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const row = (c: Countdown) => {
    const v = views.get(c.id)!;
    return (
      <li key={c.id} className="group flex items-center gap-4 py-3.5">
        <div className="w-[7.5rem] shrink-0">
          <div className="text-xs text-slate-500">{v.lead}</div>
          <div className={`mt-0.5 font-light leading-none tabular-nums ${v.ticking ? "text-2xl" : "text-3xl"} ${v.past ? "text-slate-500" : ""}`}>
            {v.value}
            {v.unit && <span className="ml-1 text-xs font-normal text-slate-500">{v.unit}</span>}
          </div>
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-2">
            <span className="truncate text-sm font-medium">{c.title}</span>
            {c.id === featured?.id && <span className="tag shrink-0">右上角</span>}
          </div>
          <div className="mt-0.5 truncate text-xs text-slate-500">{dateText(c)}</div>
        </div>
        <div className="flex shrink-0">
          <button
            className={`btn-ghost p-1.5 ${c.pinned ? "text-brand" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}
            title={c.pinned ? "取消固定（改回自动显示最近的）" : "固定显示在右上角"}
            aria-label={c.pinned ? `取消固定 ${c.title}` : `把 ${c.title} 固定在右上角`}
            aria-pressed={c.pinned}
            onClick={() => togglePin(c)}
          >
            <Pin className={`size-3.5 ${c.pinned ? "fill-current" : ""}`} />
          </button>
          <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="编辑" aria-label={`编辑 ${c.title}`} onClick={() => startEdit(c)}>
            <Pencil className="size-3.5" />
          </button>
          <button className="btn-danger p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="删除" aria-label={`删除 ${c.title}`} onClick={() => remove(c)}>
            <Trash2 className="size-3.5" />
          </button>
        </div>
      </li>
    );
  };

  const fv = featured && views.get(featured.id)!;

  return (
    // 留出固定的高度：数据还没读回来时，下面的页面内容不会先顶上来再被挤下去
    <div className="flex min-h-[34px] min-w-0 justify-end">
      {list === null ? null : featured && fv ? (
        <button
          className="glass flex min-w-0 cursor-pointer items-center gap-2 rounded-full py-1.5 pl-3 pr-3.5 text-sm transition hover:border-ink/40"
          onClick={() => setOpen(true)}
          title="查看全部倒计时"
          aria-label={`倒计时：${featured.title} ${fv.lead} ${fv.value} ${fv.unit}。点击查看全部`}
        >
          <Hourglass className="size-3.5 shrink-0 text-brand" />
          <span className="max-w-40 truncate text-slate-600">{featured.title}</span>
          <span className="flex shrink-0 items-baseline gap-1">
            <span className="text-xs text-slate-500">{fv.lead}</span>
            <span className="font-medium tabular-nums">{fv.value}</span>
            {fv.unit && <span className="text-xs text-slate-500">{fv.unit}</span>}
          </span>
        </button>
      ) : (
        <button
          className="btn-ghost rounded-full px-3 py-1.5 text-xs"
          onClick={() => {
            setOpen(true);
            startAdd();
          }}
        >
          <Hourglass className="size-3.5" /> 添加倒计时
        </button>
      )}

      {open && (
        <Modal title={draft ? (draft.id ? "编辑倒计时" : "添加倒计时") : "倒计时"} onClose={close}>
          {draft ? (
            <form onSubmit={save} className="space-y-3">
              <div>
                <label className="label" htmlFor="cd-title">
                  名称
                </label>
                <input id="cd-title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder="考试、生日、项目上线、假期…" maxLength={40} autoFocus />
              </div>
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="cd-date">
                    日期
                  </label>
                  <input id="cd-date" type="date" className="input" value={draft.date} onChange={(e) => setDraft({ ...draft, date: e.target.value })} />
                </div>
                <div>
                  <label className="label" htmlFor="cd-time">
                    时间（可不填）
                  </label>
                  <input id="cd-time" type="time" className="input" value={draft.time} onChange={(e) => setDraft({ ...draft, time: e.target.value })} />
                </div>
              </div>
              <p className="text-xs text-slate-500">
                {draft.date && draft.date < today() ? "这个日期已经过去了，会显示成「已过多少天」，可以当纪念日用。" : "不填时间按天数倒数；填了时间，最后一天会精确到秒。"}
              </p>
              <label className="flex cursor-pointer items-center gap-2 text-sm">
                <input type="checkbox" className="size-4" checked={draft.pinned} onChange={(e) => setDraft({ ...draft, pinned: e.target.checked })} />
                固定显示在右上角
              </label>

              <ErrorText msg={error} />
              <div className="flex justify-end gap-2 pt-2">
                {all.length > 0 && (
                  <button type="button" className="btn-ghost mr-auto" onClick={() => setDraft(null)}>
                    <ArrowLeft className="size-4" /> 返回列表
                  </button>
                )}
                <button type="button" className="btn-ghost" onClick={all.length > 0 ? () => setDraft(null) : close}>
                  取消
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? "保存中…" : draft.id ? "保存" : "添加"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <div className="-mt-2 max-h-[60vh] overflow-y-auto pr-1">
                {upcoming.length > 0 && <ul className="divide-y divide-line">{upcoming.map(row)}</ul>}
                {passed.length > 0 && (
                  <>
                    <h3 className={`mb-1 text-xs font-medium text-slate-500 ${upcoming.length ? "mt-4 border-t border-line pt-4" : "mt-2"}`}>已经过去的</h3>
                    <ul className="divide-y divide-line">{passed.map(row)}</ul>
                  </>
                )}
                {all.length === 0 && <p className="py-8 text-center text-sm text-slate-500">还没有倒计时。</p>}
              </div>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">{all.some((c) => c.pinned) ? "右上角显示的是你固定的那个。" : "右上角自动显示最近要到的那个，也可以用图钉固定一个。"}</p>
                <button className="btn-primary shrink-0" onClick={startAdd}>
                  <Plus className="size-4" /> 添加
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
