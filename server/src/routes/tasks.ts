import { z } from "zod";
import { crudRouter } from "../crud.js";

export const tasksRouter = crudRouter({
  table: "tasks",
  touchUpdatedAt: true,
  orderBy: "CASE priority WHEN 'high' THEN 0 WHEN 'medium' THEN 1 ELSE 2 END, due_date IS NULL, due_date, id DESC",
  schema: z.object({
    title: z.string().trim().min(1, "标题不能为空").max(200),
    description: z.string().max(5000).default(""),
    status: z.enum(["todo", "doing", "done"]).default("todo"),
    priority: z.enum(["low", "medium", "high"]).default("medium"),
    due_date: z.string().nullable().default(null),
  }),
});
