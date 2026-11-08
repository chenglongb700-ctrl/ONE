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

  res.json({ tasks, life, money, doingTasks, recentJournals, journalCount });
});
