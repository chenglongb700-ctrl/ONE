import { Router } from "express";
import { z } from "zod";
import { crudRouter } from "../crud.js";
import { db } from "../db.js";

/**
 * 倒计时：一个名称加一个目标日期（可以再带一个时刻），显示在网站右上角。
 * 目标已经过去的不会消失，变成"已过 N 天"，可以当纪念日用。
 * pinned = 固定显示在右上角，同一个账号最多一个；都没固定时，前端自动显示最近的那个。
 */
const isRealDate = (s: string) => {
  const [y, m, d] = s.split("-").map(Number);
  const t = new Date(y, m - 1, d);
  return t.getFullYear() === y && t.getMonth() === m - 1 && t.getDate() === d; // 挡住 2026-02-31 这种
};

const crud = crudRouter({
  table: "countdowns",
  orderBy: "date, time, id",
  schema: z.object({
    title: z.string().trim().min(1, "请填写名称").max(40, "名称太长了"),
    date: z
      .string()
      .regex(/^\d{4}-\d{2}-\d{2}$/, "请选择日期")
      .refine(isRealDate, "这个日期不存在"),
    // 空字符串 = 只精确到天
    time: z.union([z.literal(""), z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/, "时间格式不对")]).default(""),
    pinned: z.boolean().default(false),
  }),
  toDb: (d) => ("pinned" in d ? { ...d, pinned: d.pinned ? 1 : 0 } : d),
  fromDb: ({ user_id: _uid, ...r }) => ({ ...r, pinned: !!r.pinned }),
});

export const countdownsRouter = Router();

// 固定某一个之前，先把这个账号里其他的都取消固定
countdownsRouter.use((req, _res, next) => {
  if ((req.method === "POST" || req.method === "PUT") && req.body?.pinned === true) {
    db.prepare("UPDATE countdowns SET pinned = 0 WHERE user_id = ?").run(req.userId!);
  }
  next();
});
countdownsRouter.use(crud);
