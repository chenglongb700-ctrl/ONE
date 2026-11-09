import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowRight,
  BookOpen,
  Briefcase,
  CalendarDays,
  Check,
  CircleCheckBig,
  Leaf,
  NotebookPen,
  PenLine,
  Sun,
  Timer,
  Wallet,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, type Stats } from "../api";
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

function StatCard({
  to,
  icon: Icon,
  label,
  value,
  hint,
  tone,
  warn,
}: {
  to: string;
  icon: LucideIcon;
  label: string;
  value: string | number;
  hint: string;
  tone: string;
  warn?: boolean;
}) {
  return (
    <Link to={to} className="card group block transition hover:-translate-y-0.5 hover:shadow-xl">
      <div className="flex items-center justify-between">
        <span className="text-sm text-slate-500">{label}</span>
        <span className={`grid size-8 place-items-center rounded-lg text-white shadow-sm ${tone}`}>
          <Icon className="size-4" />
        </span>
      </div>
      <div className="mt-2 text-3xl font-bold tabular-nums">{value}</div>
      <div className={`mt-1 flex items-center gap-1 text-xs ${warn ? "font-medium text-red-600" : "text-slate-500"}`}>
        {warn && <AlertTriangle className="size-3.5" />}
        {hint}
      </div>
    </Link>
  );
}

function SectionTitle({ icon: Icon, children, to }: { icon: LucideIcon; children: string; to?: string }) {
  return (
    <div className="mb-3 flex items-center justify-between">
      <h2 className="flex items-center gap-2 font-semibold">
        <Icon className="size-4 text-slate-500" />
        {children}
      </h2>
      {to && (
        <Link to={to} className="flex items-center gap-1 text-xs text-slate-500 hover:text-slate-800">
          查看全部 <ArrowRight className="size-3.5" />
        </Link>
      )}
    </div>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);

  const load = () => api.get<Stats>("/stats").then(setS);
  useEffect(() => {
    load();
  }, []);

  const toggleHabit = async (id: number) => {
    if (!s) return;
    const next = s.todayHabits.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h));
    setS({ ...s, todayHabits: next });
    try {
      await api.post(`/habits/${id}/toggle`, { date: s.today });
      if (next.length > 1 && next.every((h) => h.checked)) toast.success("今天的习惯全部完成！");
    } catch (err) {
      toast.error((err as Error).message);
      load();
    }
  };

  const habitsDone = s?.todayHabits.filter((h) => h.checked).length ?? 0;
  const dateStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {greeting()}，{user?.username}
        </h1>
        <p className="mt-1 flex items-center gap-1.5 text-sm text-slate-500">
          <CalendarDays className="size-4" /> 今天是 {dateStr}
        </p>
      </div>

      {!s ? (
        // 骨架屏：数据回来前先占好位置，避免页面跳动
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="card h-[116px] animate-pulse">
              <div className="h-3 w-20 rounded bg-white/70" />
              <div className="mt-4 h-7 w-16 rounded bg-white/70" />
              <div className="mt-3 h-3 w-28 rounded bg-white/60" />
            </div>
          ))}
        </div>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              to="/work"
              icon={Briefcase}
              label="工作待处理"
              value={s.tasks.todo + s.tasks.doing}
              hint={s.tasks.overdue ? `${s.tasks.overdue} 项已逾期` : `已完成 ${s.tasks.done} 项`}
              warn={s.tasks.overdue > 0}
              tone="bg-indigo-500"
            />
            <StatCard
              to="/learning"
              icon={BookOpen}
              label="本周学习"
              value={(s.learning.weekMinutes / 60).toFixed(1) + " h"}
              hint={`${s.learning.active} 个学习项目进行中`}
              tone="bg-violet-500"
            />
            <StatCard
              to="/habits"
              icon={CircleCheckBig}
              label="今日打卡"
              value={s.todayHabits.length ? `${habitsDone}/${s.todayHabits.length}` : "–"}
              hint={s.todayHabits.length ? (habitsDone === s.todayHabits.length ? "今天全部完成" : "还差一点") : "还没有设置习惯"}
              tone="bg-rose-500"
            />
            <StatCard to="/life" icon={Leaf} label="生活清单" value={s.life.pending} hint={`今日 ${s.life.today} 项待办`} tone="bg-emerald-500" />
            <StatCard
              to="/life"
              icon={Wallet}
              label="本月结余"
              value={(s.money.income - s.money.expense).toFixed(2)}
              hint={`收入 ${s.money.income.toFixed(2)} · 支出 ${s.money.expense.toFixed(2)}`}
              tone="bg-sky-500"
            />
            <StatCard to="/journal" icon={PenLine} label="感悟" value={s.journalCount} hint="篇记录" tone="bg-amber-500" />
          </div>

          {s.todayHabits.length > 0 && (
            <section className="card mt-6">
              <SectionTitle icon={Sun} to="/habits">今日打卡</SectionTitle>
              <div className="flex flex-wrap gap-2">
                {s.todayHabits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => toggleHabit(h.id)}
                    aria-pressed={h.checked}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition active:scale-95 ${
                      h.checked ? `${COLORS[h.color].dot} text-white shadow-sm` : "bg-white/50 text-slate-700 ring-1 ring-white/70 hover:bg-white/80"
                    }`}
                  >
                    <span>{h.icon}</span>
                    {h.name}
                    {h.checked && <Check className="size-4" strokeWidth={3} />}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <SectionTitle icon={Timer} to="/work">进行中的工作</SectionTitle>
              {s.doingTasks.length === 0 ? (
                <p className="text-sm text-slate-400">暂无进行中的任务</p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {s.doingTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">{t.title}</span>
                      <span className="flex shrink-0 items-center gap-2 text-xs text-slate-500">
                        {t.due_date && (
                          <span className="flex items-center gap-1">
                            <CalendarDays className="size-3.5" />
                            {t.due_date}
                          </span>
                        )}
                        <span className={`rounded px-1.5 py-0.5 ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <SectionTitle icon={NotebookPen} to="/journal">最近的感悟</SectionTitle>
              {s.recentJournals.length === 0 ? (
                <p className="text-sm text-slate-400">
                  还没有记录，<Link to="/journal" className="underline">写下第一篇</Link>
                </p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {s.recentJournals.map((j) => (
                    <li key={j.id} className="flex items-center justify-between gap-3 py-2 text-sm">
                      <span className="min-w-0 truncate">
                        {j.mood} {j.title}
                      </span>
                      <span className="shrink-0 text-xs text-slate-500">{j.date}</span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
          </div>
        </>
      )}
    </div>
  );
}
