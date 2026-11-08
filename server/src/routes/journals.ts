import { z } from "zod";
import { crudRouter } from "../crud.js";

export const journalsRouter = crudRouter({
  table: "journals",
  orderBy: "date DESC, id DESC",
  schema: z.object({
    title: z.string().trim().min(1, "标题不能为空").max(200),
    content: z.string().max(50000).default(""),
    mood: z.string().max(8).default("😊"),
    tags: z.string().max(200).default(""),
    date: z.string().min(1, "请选择日期"),
  }),
});
