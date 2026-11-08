import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, type Stats } from "../api";
import { useAuth } from "../context/AuthContext";
import { PRIORITY } from "./Work";

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
      <div className="flex items-center gap-2 text-sm text-stone-500">
        <span>{icon}</span>
        {label}
      </div>
      <div className="mt-2 text-3xl font-bold">{value}</div>
      <div className="mt-1 text-xs text-stone-500">{hint}</div>
    </Link>
  );
}

export default function Dashboard() {
  const { user } = useAuth();
  const [s, setS] = useState<Stats | null>(null);

  useEffect(() => {
    api.get<Stats>("/stats").then(setS);
  }, []);

  const dateStr = new Date().toLocaleDateString("zh-CN", { month: "long", day: "numeric", weekday: "long" });

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-2xl font-bold">
          {greeting()}，{user?.username} 👋
        </h1>
        <p className="mt-1 text-sm text-stone-500">今天是 {dateStr}</p>
      </div>

      {!s ? (
        <p className="text-stone-400">加载中…</p>
      ) : (
        <>
          <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
            <StatCard
              to="/work"
              icon="💼"
              label="工作待处理"
              value={s.tasks.todo + s.tasks.doing}
              hint={s.tasks.overdue ? `⚠️ ${s.tasks.overdue} 项已逾期` : `已完成 ${s.tasks.done} 项`}
              tone="border-l-4 border-l-indigo-400"
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

          <div className="mt-6 grid gap-4 lg:grid-cols-2">
            <section className="card">
              <h2 className="mb-3 font-semibold">🚧 进行中的工作</h2>
              {s.doingTasks.length === 0 ? (
                <p className="text-sm text-stone-400">暂无进行中的任务</p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {s.doingTasks.map((t) => (
                    <li key={t.id} className="flex items-center justify-between py-2 text-sm">
                      <span>{t.title}</span>
                      <span className="flex items-center gap-2 text-xs text-stone-500">
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
                <p className="text-sm text-stone-400">
                  还没有记录，<Link to="/journal" className="underline">写下第一篇</Link>
                </p>
              ) : (
                <ul className="divide-y divide-stone-100">
                  {s.recentJournals.map((j) => (
                    <li key={j.id} className="flex items-center justify-between py-2 text-sm">
                      <span>
                        {j.mood} {j.title}
                      </span>
                      <span className="text-xs text-stone-500">{j.date}</span>
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
