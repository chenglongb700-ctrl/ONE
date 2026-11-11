import { useEffect, useState, type ReactNode } from "react";
import { Link } from "react-router-dom";
import { Check, TriangleAlert } from "lucide-react";
import { toast } from "sonner";
import { api, today, type LifeItem, type Stats, type Task, type TaskStatus } from "../api";
import { useAuth } from "../context/AuthContext";
import { PRIORITY } from "./Work";
import { COLORS } from "./Habits";

function greeting() {
  const h = new Date().getHours();
  if (h < 6) return "夜深了";
  if (h < 12) return "早上好";
  if (h < 14) return "中午好";
  if (h < 18) return "下午好";
  return "晚上好";
}

const LIFE_LIMIT = 8; // 生活清单最多列出几条，多的去清单页看

/** 圆形勾选按钮：工作、打卡、生活三种事项共用 */
function CheckDot({ on, onClick, label, tone = "bg-brand text-paper" }: { on: boolean; onClick: () => void; label: string; tone?: string }) {
  return (
    <button
      onClick={onClick}
      aria-pressed={on}
      aria-label={label}
      title={on ? "点击取消" : "点击完成"}
      className={`grid size-[22px] shrink-0 cursor-pointer place-items-center rounded-full transition active:scale-90 ${
        on ? tone : "ring-[1.5px] ring-inset ring-ink/25 hover:ring-brand"
      }`}
    >
      {on && <Check className="size-3.5" strokeWidth={3} />}
    </button>
  );
}

function Group({ title, to, linkText, empty, children }: { title: string; to: string; linkText: string; empty: ReactNode; children: ReactNode[] }) {
  return (
    <section className="border-t border-line first:border-t-0">
      <div className="flex items-baseline justify-between px-5 pb-1 pt-4">
        <h2 className="text-sm font-medium">
          {title}
          {children.length > 0 && <span className="ml-2 font-normal tabular-nums text-slate-400">{children.length}</span>}
        </h2>
        <Link to={to} className="text-xs text-slate-500 underline-offset-4 hover:text-ink hover:underline">
          {linkText}
        </Link>
      </div>
      {children.length === 0 ? <p className="px-5 pb-4 pt-1 text-sm text-slate-400">{empty}</p> : <ul className="pb-2">{children}</ul>}
    </section>
  );
}

const ROW = "flex items-center gap-3 px-5 py-2 text-sm";

function Figure({ to, label, value, unit, hint, warn }: { to: string; label: string; value: string | number; unit?: string; hint: string; warn?: boolean }) {
  return (
    <Link to={to} className="block px-4 py-3.5 shadow-[1px_0_0_var(--line),0_1px_0_var(--line)] transition-colors hover:bg-ink/[0.03]">
      <div className="text-xs text-slate-500">{label}</div>
      <div className="mt-1.5 font-display text-2xl font-light leading-none tabular-nums">
        {value}
        {unit && <span className="ml-1 font-sans text-xs font-normal text-slate-500">{unit}</span>}
      </div>
      <div className={`mt-2 flex items-center gap-1 text-xs ${warn ? "font-medium text-red-600" : "text-slate-500"}`}>
        {warn && <TriangleAlert className="size-3.5 shrink-0" />}
        {hint}
      </div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);
  // 今天要处理的工作和生活事项：进页面时定下来，勾掉以后留在原位（方便反悔），刷新后才消失
  const [tasks, setTasks] = useState<Task[]>([]);
  const [prevStatus, setPrevStatus] = useState<Record<number, TaskStatus>>({});
  const [life, setLife] = useState<LifeItem[]>([]);
  const t0 = today();

  const loadStats = () => api.get<Stats>("/stats").then(setS);
  useEffect(() => {
    loadStats();
    api.get<Task[]>("/tasks").then((all) => {
      // 进行中的，加上已经到期或今天到期的待办；逾期的排最前
      const mine = all.filter((t) => t.status === "doing" || (t.status === "todo" && t.due_date !== null && t.due_date <= t0));
      const late = (t: Task) => (t.due_date !== null && t.due_date < t0 ? 0 : 1);
      setTasks(mine.sort((a, b) => late(a) - late(b)));
    });
    api.get<LifeItem[]>("/life").then((all) => setLife(all.filter((x) => !x.done && (x.date === null || x.date <= t0))));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const fail = (err: unknown) => toast.error((err as Error).message);

  const toggleTask = async (t: Task) => {
    const done = t.status !== "done";
    const status: TaskStatus = done ? "done" : (prevStatus[t.id] ?? "doing");
    if (done) setPrevStatus((p) => ({ ...p, [t.id]: t.status }));
    setTasks((list) => list.map((x) => (x.id === t.id ? { ...x, status } : x)));
    try {
      await api.put(`/tasks/${t.id}`, { status });
      loadStats();
    } catch (err) {
      setTasks((list) => list.map((x) => (x.id === t.id ? t : x)));
      fail(err);
    }
  };

  const toggleLife = async (it: LifeItem) => {
    setLife((list) => list.map((x) => (x.id === it.id ? { ...x, done: !it.done } : x)));
    try {
      await api.put(`/life/${it.id}`, { done: !it.done });
      loadStats();
    } catch (err) {
      setLife((list) => list.map((x) => (x.id === it.id ? it : x)));
      fail(err);
    }
  };

  const toggleHabit = async (id: number) => {
    if (!s) return;
    const next = s.todayHabits.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h));
    setS({ ...s, todayHabits: next });
    try {
      await api.post(`/habits/${id}/toggle`, { date: s.today });
      if (next.length > 1 && next.every((h) => h.checked)) toast.success("今天的习惯全部完成！");
    } catch (err) {
      fail(err);
      loadStats();
    }
  };

  const now = new Date();
  const weekday = now.toLocaleDateString("zh-CN", { weekday: "long" });
  const dateText = `${now.getMonth() + 1}月${now.getDate()}日`;
  const habits = s?.todayHabits ?? [];
  const habitsDone = habits.filter((h) => h.checked).length;

  // 一句话概括：还剩几件事
  const left = tasks.filter((t) => t.status !== "done").length + (habits.length - habitsDone) + life.filter((x) => !x.done).length;
  const total = tasks.length + habits.length + life.length;
  const summary = !s ? "" : total === 0 ? "今天还没有安排。" : left === 0 ? "今天的事都做完了。" : `今天还有 ${left} 件事。`;

  return (
    <div className="grid gap-x-8 gap-y-6 lg:grid-cols-[minmax(0,1fr)_19rem] xl:grid-cols-[minmax(0,1fr)_21rem]">
      {/* 左栏：今天要做的事 */}
      <div className="min-w-0">
        <header className="mb-6">
          <p className="mb-1 text-sm text-slate-500 lg:hidden">
            {dateText} {weekday}
          </p>
          <h1 className="text-[28px] font-light leading-tight tracking-wide">
            {greeting()}，{user?.username}
          </h1>
          <p className="mt-1.5 h-5 text-sm text-slate-500">{summary}</p>
        </header>

        <div className="card p-0">
          <Group title="工作" to="/work" linkText="打开看板" empty="没有进行中或到期的任务。">
            {tasks.map((t) => {
              const done = t.status === "done";
              const overdue = !done && t.due_date !== null && t.due_date < t0;
              return (
                <li key={t.id} className={ROW}>
                  <CheckDot on={done} onClick={() => toggleTask(t)} label={`${t.title}，${done ? "已完成" : "未完成"}`} />
                  <span className={`min-w-0 flex-1 truncate ${done ? "text-slate-400 line-through" : ""}`}>{t.title}</span>
                  {t.due_date && !done && (
                    <span className={`shrink-0 text-xs tabular-nums ${overdue ? "font-medium text-red-600" : "text-slate-500"}`}>
                      {overdue ? `逾期 ${t.due_date.slice(5)}` : t.due_date === t0 ? "今天到期" : t.due_date.slice(5)}
                    </span>
                  )}
                  <span className={`shrink-0 rounded-md px-1.5 py-0.5 text-xs ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                </li>
              );
            })}
          </Group>

          <Group title="打卡" to="/habits" linkText="查看习惯" empty="还没有设置习惯。">
            {habits.map((h) => (
              <li key={h.id} className={ROW}>
                <CheckDot on={h.checked} onClick={() => toggleHabit(h.id)} label={`${h.name}，${h.checked ? "已打卡" : "未打卡"}`} tone={`${COLORS[h.color].dot} text-white`} />
                <span className={`min-w-0 flex-1 truncate ${h.checked ? "text-slate-400" : ""}`}>
                  <span className="mr-2">{h.icon}</span>
                  {h.name}
                </span>
              </li>
            ))}
          </Group>

          <Group title="生活" to="/life" linkText={life.length > LIFE_LIMIT ? `全部 ${life.length} 项` : "打开清单"} empty="清单里没有今天要做的事。">
            {life.slice(0, LIFE_LIMIT).map((it) => (
              <li key={it.id} className={ROW}>
                <CheckDot on={it.done} onClick={() => toggleLife(it)} label={`${it.title}，${it.done ? "已完成" : "未完成"}`} />
                <span className={`min-w-0 flex-1 truncate ${it.done ? "text-slate-400 line-through" : ""}`}>{it.title}</span>
                {it.date && it.date < t0 && !it.done && <span className="shrink-0 text-xs font-medium tabular-nums text-red-600">逾期 {it.date.slice(5)}</span>}
                <span className="tag shrink-0">{it.category}</span>
              </li>
            ))}
          </Group>
        </div>
      </div>

      {/* 右栏：日期和各项数字 */}
      <aside className="min-w-0 space-y-6">
        <div className="hidden lg:block">
          <p className="font-display text-6xl font-light leading-none tracking-tight tabular-nums" aria-label={dateText}>
            {now.getMonth() + 1}
            <span className="mx-1 font-sans text-xl font-light">月</span>
            {now.getDate()}
            <span className="ml-1 font-sans text-xl font-light">日</span>
          </p>
          <p className="mt-2 text-sm text-slate-500">{weekday}</p>
        </div>

        {!s ? (
          <div className="card h-56 animate-pulse" />
        ) : (
          <>
            <section className="card overflow-hidden p-0" aria-label="各项数字">
              <div className="-mb-px -mr-px grid grid-cols-2">
                <Figure
                  to="/work"
                  label="工作待处理"
                  value={s.tasks.todo + s.tasks.doing}
                  unit="项"
                  hint={s.tasks.overdue ? `${s.tasks.overdue} 项已逾期` : `已完成 ${s.tasks.done} 项`}
                  warn={s.tasks.overdue > 0}
                />
                <Figure to="/learning" label="本周学习" value={(s.learning.weekMinutes / 60).toFixed(1)} unit="小时" hint={`${s.learning.active} 个项目进行中`} />
                <Figure
                  to="/habits"
                  label="今日打卡"
                  value={habits.length ? `${habitsDone}/${habits.length}` : "–"}
                  hint={habits.length ? (habitsDone === habits.length ? "全部完成" : `还差 ${habits.length - habitsDone} 个`) : "还没有设置"}
                />
                <Figure to="/life" label="生活清单" value={s.life.pending} unit="项" hint={`其中今天 ${s.life.today} 项`} />
                <Figure to="/life" label="本月结余" value={(s.money.income - s.money.expense).toFixed(0)} unit="元" hint={`支出 ${s.money.expense.toFixed(0)}`} />
                <Figure to="/journal" label="感悟" value={s.journalCount} unit="篇" hint={s.recentJournals[0] ? `最近 ${s.recentJournals[0].date.slice(5)}` : "还没有开始写"} />
              </div>
            </section>

            <section>
              <div className="mb-1 flex items-baseline justify-between">
                <h2 className="text-sm font-medium">最近的感悟</h2>
                <Link to="/journal" className="text-xs text-slate-500 underline-offset-4 hover:text-ink hover:underline">
                  查看全部
                </Link>
              </div>
              {s.recentJournals.length === 0 ? (
                <p className="border-t border-line py-3 text-sm text-slate-400">
                  还没有记录。
                  <Link to="/journal" className="underline underline-offset-4 hover:text-ink">
                    写下第一篇
                  </Link>
                </p>
              ) : (
                <ul className="divide-y divide-line border-t border-line">
                  {s.recentJournals.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        <span className="mr-2">{j.mood}</span>
                        {j.title}
                      </span>
                      <span className="shrink-0 text-xs tabular-nums text-slate-500">{j.date.slice(5)}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
