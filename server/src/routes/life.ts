import { z } from "zod";
import { crudRouter } from "../crud.js";

export const lifeRouter = crudRouter({
  table: "life_items",
  orderBy: "done, date IS NULL, date, id DESC",
  schema: z.object({
    title: z.string().trim().min(1, "内容不能为空").max(200),
    category: z.string().trim().min(1).max(20).default("其他"),
    done: z.boolean().default(false),
    date: z.string().nullable().default(null),
  }),
  toDb: (d) => ("done" in d ? { ...d, done: d.done ? 1 : 0 } : d),
  fromDb: (r) => ({ ...r, done: !!r.done }),
});
