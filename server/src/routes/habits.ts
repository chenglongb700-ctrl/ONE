import { Router } from "express";
import { z } from "zod";
import { crudRouter } from "../crud.js";
import { db } from "../db.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

export const habitsRouter = Router();

// 打卡相关的路由要写在 crud 的 /:id 之前，否则 "checks" 会被当成 id
// GET /api/habits/checks?from=2026-01-01&to=2026-12-31 → 这段时间内所有打卡记录
habitsRouter.get("/checks", (req, res) => {
  const from = dateStr.parse(req.query.from);
  const to = dateStr.parse(req.query.to);
  const rows = db
    .prepare("SELECT habit_id, date FROM habit_checks WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date")
    .all(req.userId!, from, to);
  res.json(rows);
});

// POST /api/habits/:id/toggle {date} → 没打卡就打卡，已打卡就取消
habitsRouter.post("/:id/toggle", (req, res) => {
  const id = z.coerce.number().int().positive().parse(req.params.id);
  const date = dateStr.parse(req.body?.date);
  const habit = db.prepare("SELECT id FROM habits WHERE id = ? AND user_id = ?").get(id, req.userId!);
  if (!habit) return void res.status(404).json({ error: "习惯不存在" });

  const removed = db.prepare("DELETE FROM habit_checks WHERE habit_id = ? AND date = ?").run(id, date);
  if (removed.changes) return void res.json({ checked: false });
  db.prepare("INSERT INTO habit_checks (user_id, habit_id, date) VALUES (?, ?, ?)").run(req.userId!, id, date);
  res.json({ checked: true });
});

habitsRouter.use(
  crudRouter({
    table: "habits",
    orderBy: "archived, id",
    schema: z.object({
      name: z.string().trim().min(1, "名称不能为空").max(50),
      icon: z.string().max(8).default("✅"),
      color: z.enum(["emerald", "sky", "indigo", "amber", "rose", "violet"]).default("emerald"),
      archived: z.boolean().default(false),
    }),
    toDb: (d) => ("archived" in d ? { ...d, archived: d.archived ? 1 : 0 } : d),
    fromDb: (r) => ({ ...r, archived: !!r.archived }),
  }),
);
