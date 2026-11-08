import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
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

function StatCard({ to, icon, label, value, hint, tone }: { to: string; icon: string; label: string; value: string | number; hint: string; tone: string }) {
  return (
    <Link to={to} className={`card block transition hover:-translate-y-0.5 hover:shadow-md ${tone}`}>
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <span>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-slate-500">{hint}</div>
    </Link>
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
    setS({ ...s, todayHabits: s.todayHabits.map((h) => (h.id === id ? { ...h, checked: !h.checked } : h)) });
    await api.post(`/habits/${id}/toggle`, { date: s.today }).catch(load);
  };

  const habitsDone = s?.todayHabits.filter((h) => h.checked).length ?? 0;

  const dateStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {greeting()}，{user?.username} 👋
        </h1>
        <p className="mt-1 text-sm text-slate-500">今天是 {dateStr}</p>
      </div>

      {!s ? (
        <p className="text-slate-400">加载中…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-3">
            <StatCard
              to="/work"
              icon="💼"
              label="工作待处理"
              value={s.tasks.todo + s.tasks.doing}
              hint={s.tasks.overdue ? `⚠️ ${s.tasks.overdue} 项已逾期` : `已完成 ${s.tasks.done} 项`}
              tone="border-l-4 border-l-indigo-400"
            />
            <StatCard
              to="/learning"
              icon="📚"
              label="本周学习"
              value={(s.learning.weekMinutes / 60).toFixed(1) + " h"}
              hint={`${s.learning.active} 个学习项目进行中`}
              tone="border-l-4 border-l-violet-400"
            />
            <StatCard
              to="/habits"
              icon="✅"
              label="今日打卡"
              value={s.todayHabits.length ? `${habitsDone}/${s.todayHabits.length}` : "–"}
              hint={s.todayHabits.length ? (habitsDone === s.todayHabits.length ? "今天全部完成 🎉" : "还差一点") : "还没有设置习惯"}
              tone="border-l-4 border-l-rose-400"
            />
            <StatCard
              to="/life"
              icon="🌿"
              label="生活清单"
              value={s.life.pending}
              hint={`今日 ${s.life.today} 项待办`}
              tone="border-l-4 border-l-emerald-400"
            />
            <StatCard
              to="/life"
              icon="💰"
              label="本月结余"
              value={(s.money.income - s.money.expense).toFixed(2)}
              hint={`收入 ${s.money.income.toFixed(2)} · 支出 ${s.money.expense.toFixed(2)}`}
              tone="border-l-4 border-l-sky-400"
            />
            <StatCard
              to="/journal"
              icon="✍️"
              label="感悟"
              value={s.journalCount}
              hint="篇记录"
              tone="border-l-4 border-l-amber-400"
            />
          </div>

          {s.todayHabits.length > 0 && (
            <section className="card mt-6">
              <div className="mb-3 flex items-baseline justify-between">
                <h2 className="font-semibold">☀️ 今日打卡</h2>
                <Link to="/habits" className="text-xs text-slate-500 hover:underline">查看全部 →</Link>
              </div>
              <div className="flex flex-wrap gap-2">
                {s.todayHabits.map((h) => (
                  <button
                    key={h.id}
                    onClick={() => toggleHabit(h.id)}
                    className={`flex items-center gap-2 rounded-full px-3 py-1.5 text-sm transition ${
                      h.checked ? `${COLORS[h.color].dot} text-white shadow-sm` : "bg-white/50 text-slate-700 ring-1 ring-white/70 hover:bg-white/80"
                    }`}
                  >
                    <span>{h.icon}</span>
                    {h.name}
                    {h.checked && <span>✓</span>}
                  </button>
                ))}
              </div>
            </section>
          )}

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 font-semibold">🚧 进行中的工作</h2>
              {s.doingTasks.length === 0 ? (
                <p className="text-sm text-slate-400">暂无进行中的任务</p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {s.doingTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{t.title}</span>
                      <span className="flex items-center gap-2 text-xs text-slate-500">
                        {t.due_date && <span>📅 {t.due_date}</span>}
                        <span className={`rounded px-1.5 py-0.5 ${PRIORITY[t.priority].cls}`}>{PRIORITY[t.priority].label}</span>
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>
            <section className="card">
              <h2 className="mb-3 font-semibold">📖 最近的感悟</h2>
              {s.recentJournals.length === 0 ? (
                <p className="text-sm text-slate-400">
                  还没有记录，<Link to="/journal" className="underline">写下第一篇</Link>
                </p>
              ) : (
                <ul className="divide-y divide-white/60">
                  {s.recentJournals.map((j) => (
                    <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {j.mood} {j.title}
                      </span>
                      <span className="text-xs text-slate-500">{j.date}</span>
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
