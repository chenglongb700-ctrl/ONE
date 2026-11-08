import { z } from "zod";
import { crudRouter } from "../crud.js";

export const expensesRouter = crudRouter({
  table: "expenses",
  orderBy: "date DESC, id DESC",
  schema: z.object({
    type: z.enum(["income", "expense"]),
    amount: z.coerce.number().positive("金额必须大于 0"),
    category: z.string().trim().min(1).max(20).default("其他"),
    note: z.string().max(500).default(""),
    date: z.string().min(1, "请选择日期"),
  }),
});
