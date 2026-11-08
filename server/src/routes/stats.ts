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

  // 本周（周一开始）学习时长
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  const weekStart = d.toLocaleDateString("sv");
  const learning = db
    .prepare(
      `SELECT COALESCE(SUM(minutes), 0) AS weekMinutes,
              (SELECT COUNT(*) FROM learning_items WHERE user_id = ?1 AND status = 'active') AS active
       FROM learning_logs WHERE user_id = ?1 AND date >= ?2`,
    )
    .get(uid, weekStart);

  // 今日习惯：每个未归档习惯今天是否已打卡
  const todayHabits = db
    .prepare(
      `SELECT h.id, h.name, h.icon, h.color,
              EXISTS (SELECT 1 FROM habit_checks c WHERE c.habit_id = h.id AND c.date = ?) AS checked
       FROM habits h WHERE h.user_id = ? AND h.archived = 0 ORDER BY h.id`,
    )
    .all(today, uid)
    .map((h) => ({ ...h, checked: !!(h as { checked: number }).checked }));

  res.json({ tasks, life, money, doingTasks, recentJournals, journalCount, learning, todayHabits, today });
});
