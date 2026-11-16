import { Router } from "express";
import { db } from "../db.js";

export const statsRouter = Router();

statsRouter.get("/", (req, res) => {
  const uid = req.userId!;
  const today = new Date().toLocaleDateString("sv"); // 本地时间 YYYY-MM-DD
  const month = today.slice(0, 7);

  const tasks = db
    .prepare(
      `SELECT
         COALESCE(SUM(status = 'todo'), 0)  AS todo,
         COALESCE(SUM(status = 'doing'), 0) AS doing,
         COALESCE(SUM(status = 'done'), 0)  AS done,
         COALESCE(SUM(status != 'done' AND due_date IS NOT NULL AND due_date < ?), 0) AS overdue
       FROM tasks WHERE user_id = ?`,
    )
    .get(today, uid);

  const life = db
    .prepare(
      `SELECT COALESCE(SUM(done = 0), 0) AS pending,
              COALESCE(SUM(done = 0 AND date = ?), 0) AS today
       FROM life_items WHERE user_id = ?`,
    )
    .get(today, uid);

  const money = db
    .prepare(
      `SELECT COALESCE(SUM(CASE WHEN type = 'income'  THEN amount END), 0) AS income,
              COALESCE(SUM(CASE WHEN type = 'expense' THEN amount END), 0) AS expense
       FROM expenses WHERE user_id = ? AND substr(date, 1, 7) = ?`,
    )
    .get(uid, month);

  const doingTasks = db
    .prepare(
      "SELECT id, title, priority, due_date FROM tasks WHERE user_id = ? AND status = 'doing' ORDER BY updated_at DESC LIMIT 5",
    )
    .all(uid);

  const recentJournals = db
    .prepare("SELECT id, title, mood, date FROM journals WHERE user_id = ? ORDER BY date DESC, id DESC LIMIT 5")
    .all(uid);

  const journalCount = (db.prepare("SELECT COUNT(*) AS n FROM journals WHERE user_id = ?").get(uid) as { n: number }).n;

  res.json({ tasks, life, money, doingTasks, recentJournals, journalCount, today });
});

/**
 * GET /stats/charts → 总览页下方三张图的数据：
 *   taskDays    最近 14 天每天完成了几个任务（任务没有单独的完成时间，用最后修改时间）
 *   taskStatus  现在待办 / 进行中 / 已完成各有多少
 *   activity    最近 17 周每天记了多少条东西（完成的任务 + 记的账 + 写的随记），热力图用
 *   moods       最近 30 天的随记里各种心情出现了几次
 */
statsRouter.get("/charts", (req, res) => {
  const uid = req.userId!;
  const ymd = (d: Date) => d.toLocaleDateString("sv");
  const daysAgo = (n: number) => {
    const d = new Date();
    d.setDate(d.getDate() - n);
    return ymd(d);
  };
  const today = ymd(new Date());

  // 热力图从 16 周前的那个周一开始，这样每一列正好是一周
  const start = new Date();
  start.setDate(start.getDate() - ((start.getDay() + 6) % 7) - 16 * 7);
  const from = ymd(start);

  const doneByDay = new Map(
    (db.prepare("SELECT substr(updated_at, 1, 10) AS date, COUNT(*) AS n FROM tasks WHERE user_id = ? AND status = 'done' AND substr(updated_at, 1, 10) >= ? GROUP BY 1").all(uid, from) as { date: string; n: number }[]).map((r) => [r.date, r.n]),
  );
  const count = (table: string) => new Map((db.prepare(`SELECT date, COUNT(*) AS n FROM ${table} WHERE user_id = ? AND date >= ? GROUP BY date`).all(uid, from) as { date: string; n: number }[]).map((r) => [r.date, r.n]));
  const expenses = count("expenses");
  const journals = count("journals");

  const activity: { date: string; tasks: number; expenses: number; journals: number }[] = [];
  for (const d = new Date(start); ymd(d) <= today; d.setDate(d.getDate() + 1)) {
    const date = ymd(d);
    activity.push({ date, tasks: doneByDay.get(date) ?? 0, expenses: expenses.get(date) ?? 0, journals: journals.get(date) ?? 0 });
  }

  const taskDays = Array.from({ length: 14 }, (_, i) => {
    const date = daysAgo(13 - i);
    return { date, done: doneByDay.get(date) ?? 0 };
  });
  const taskStatus = db
    .prepare("SELECT COALESCE(SUM(status = 'todo'), 0) AS todo, COALESCE(SUM(status = 'doing'), 0) AS doing, COALESCE(SUM(status = 'done'), 0) AS done FROM tasks WHERE user_id = ?")
    .get(uid);
  const moods = db.prepare("SELECT mood, COUNT(*) AS n FROM journals WHERE user_id = ? AND date >= ? GROUP BY mood ORDER BY n DESC, mood LIMIT 8").all(uid, daysAgo(29));

  res.json({ taskDays, taskStatus, activity, moods });
});
