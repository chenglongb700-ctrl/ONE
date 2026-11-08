import { z } from "zod";
import { crudRouter } from "../crud.js";

const dateStr = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式应为 YYYY-MM-DD");

// 学习项目：列表里顺带算出累计学习分钟数和最近一次学习日期（子查询）
export const learningRouter = crudRouter({
  table: "learning_items",
  touchUpdatedAt: true,
  select: `*,
    (SELECT COALESCE(SUM(minutes), 0) FROM learning_logs l WHERE l.item_id = learning_items.id) AS total_minutes,
    (SELECT MAX(date) FROM learning_logs l WHERE l.item_id = learning_items.id) AS last_date`,
  orderBy:
    "CASE status WHEN 'active' THEN 0 WHEN 'planned' THEN 1 WHEN 'paused' THEN 2 ELSE 3 END, target_date IS NULL, target_date, id DESC",
  filters: ["status"],
  schema: z.object({
    title: z.string().trim().min(1, "名称不能为空").max(200),
    kind: z.enum(["book", "course", "skill", "other"]).default("book"),
    status: z.enum(["planned", "active", "paused", "done"]).default("active"),
    goal: z.string().max(1000).default(""),
    progress: z.coerce.number().min(0, "进度不能为负").default(0),
    total: z.coerce.number().positive("总量必须大于 0").nullable().default(null),
    unit: z.string().trim().min(1).max(10).default("章"),
    target_date: dateStr.nullable().default(null),
  }),
});

// 学习日志：item_id 必须是自己的学习项目
export const learningLogsRouter = crudRouter({
  table: "learning_logs",
  orderBy: "date DESC, id DESC",
  filters: ["item_id"],
  ownedRefs: { item_id: "learning_items" },
  schema: z.object({
    item_id: z.coerce.number().int().positive(),
    date: dateStr,
    minutes: z.coerce.number().int().min(0, "时长不能为负").max(24 * 60, "一天最多 1440 分钟"),
    content: z.string().max(5000).default(""),
  }),
});
