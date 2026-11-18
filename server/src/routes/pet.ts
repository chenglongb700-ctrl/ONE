import { Router } from "express";
import { db } from "../db.js";
import { aiStatus } from "../ai.js";
import { balance, usageToday } from "../aiUsage.js";

/**
 * 桌宠要用的数据（GET /api/pet）：要不要提醒什么、你最近记得勤不勤、它长到多大了。
 * 全部在本机数据库里算，不调用 AI，不花钱。只读这个账号自己的数据。
 * 另外带上 AI 今天用了多少 token、账户还剩多少钱（余额要问一下模型那边的接口，缓存一分钟，见 aiUsage.ts）。
 *
 * "记录日"：这一天在网站上记过任何东西（建任务、记账、写随记、加清单、记体重、饮食、运动、力量）。
 * 按"哪天记的"算（created_at），不是按记录上填的日期：补记上周的账也算今天记过。体重没有 created_at，按它的日期算。
 */
const ymd = (d: Date) => d.toLocaleDateString("sv");
const addDays = (date: string, n: number) => {
  const d = new Date(`${date}T12:00:00`);
  d.setDate(d.getDate() + n);
  return ymd(d);
};

type Row = Record<string, string | number | null>;
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as Row | undefined;

/** 余额低于这个数就提醒（单位跟着账户的币种走，DeepSeek 是人民币） */
const LOW_BALANCE = 1;

/** 成长阶段：按一共记过多少天。每一阶段团子会多一样东西（见前端 pet/Blob.tsx） */
const STAGES = [
  { level: 1, name: "小团子", from: 0 },
  { level: 2, name: "冒芽团子", from: 3 },
  { level: 3, name: "开花团子", from: 10 },
  { level: 4, name: "星星团子", from: 30 },
  { level: 5, name: "皇冠团子", from: 90 },
];

export const petRouter = Router();

petRouter.get("/", async (req, res) => {
  const uid = req.userId!;
  const today = ymd(new Date());

  // 每一天记了几条（只看 created_at 的日期部分；数据库里存的是本地时间）
  const days = all(
    `SELECT d, COUNT(*) AS n FROM (
       SELECT substr(created_at, 1, 10) AS d FROM tasks WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM life_items WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM expenses WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM journals WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM food_logs WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM workouts WHERE user_id = ?
       UNION ALL SELECT substr(created_at, 1, 10) FROM strength_logs WHERE user_id = ?
       UNION ALL SELECT date FROM body_logs WHERE user_id = ?
     ) GROUP BY d`,
    uid, uid, uid, uid, uid, uid, uid, uid,
  );
  const perDay = new Map(days.map((r) => [String(r.d), Number(r.n)]));
  const todayCount = perDay.get(today) ?? 0;

  // 连续记录：从今天往前数；今天还没记的话从昨天开始数（今天还有机会接上）
  let streak = 0;
  for (let d = perDay.has(today) ? today : addDays(today, -1); perDay.has(d); d = addDays(d, -1)) streak++;

  const totalDays = perDay.size;
  const stage = [...STAGES].reverse().find((s) => totalDays >= s.from)!;
  const next = STAGES.find((s) => s.from > totalDays);

  // ---- 提醒 ----
  const overdue = all("SELECT title, due_date FROM tasks WHERE user_id = ? AND status != 'done' AND due_date IS NOT NULL AND due_date < ? ORDER BY due_date LIMIT 3", uid, today);
  const overdueCount = Number(one("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND status != 'done' AND due_date IS NOT NULL AND due_date < ?", uid, today)?.n ?? 0);
  const dueToday = all("SELECT title FROM tasks WHERE user_id = ? AND status != 'done' AND due_date = ? LIMIT 3", uid, today);
  const countdown = one("SELECT title, date FROM countdowns WHERE user_id = ? AND date >= ? AND date <= ? ORDER BY date LIMIT 1", uid, today, addDays(today, 3));
  const fitness = !!one("SELECT 1 AS x FROM fitness_profile WHERE user_id = ?", uid);
  const weighedToday = !!one("SELECT 1 AS x FROM body_logs WHERE user_id = ? AND date = ?", uid, today);
  const journalToday = !!one("SELECT 1 AS x FROM journals WHERE user_id = ? AND date = ?", uid, today);

  const reminders: { id: string; text: string; to?: string }[] = [];
  if (overdueCount)
    reminders.push({ id: `overdue-${overdueCount}`, text: overdueCount === 1 ? `「${overdue[0].title}」已经过了截止日期啦` : `有 ${overdueCount} 个任务过了截止日期，最早的是「${overdue[0].title}」`, to: "/work" });
  if (dueToday.length) reminders.push({ id: `today-${dueToday.length}`, text: dueToday.length === 1 ? `「${dueToday[0].title}」今天截止哦` : `今天有 ${dueToday.length} 个任务截止`, to: "/work" });
  if (countdown) {
    const left = Math.round((new Date(`${countdown.date}T12:00:00`).getTime() - new Date(`${today}T12:00:00`).getTime()) / 86_400_000);
    reminders.push({ id: `countdown-${countdown.title}-${countdown.date}`, text: left === 0 ? `今天就是「${countdown.title}」！` : `离「${countdown.title}」还有 ${left} 天`, to: "/" });
  }
  if (fitness && !weighedToday) reminders.push({ id: "weigh", text: "今天还没称体重～", to: "/fitness" });
  if (!journalToday) reminders.push({ id: "journal", text: "今天还没写随记，要不要记两句？", to: "/journal" });

  // ---- AI 用量和余额 ----
  const status = aiStatus();
  const money = status.configured ? await balance() : null;
  const ai = status.configured ? { model: status.model, today: usageToday(uid), balance: money } : null;
  if (money && money.amount < LOW_BALANCE) reminders.push({ id: "ai-balance", text: `AI 账户只剩 ${money.currency === "CNY" ? "¥" : `${money.currency} `}${money.amount.toFixed(2)} 了，记得去充值` });

  res.json({
    today,
    todayCount,
    streak,
    totalDays,
    stage: { level: stage.level, name: stage.name, next: next ? { name: next.name, daysLeft: next.from - totalDays } : null },
    reminders,
    ai,
  });
});
