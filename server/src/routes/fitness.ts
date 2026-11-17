import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { crudRouter } from "../crud.js";
import { aiStatus, chatStream } from "../ai.js";
import { streamReply } from "../aiStream.js";
import { ACTIVITY, bmiLabel, daysToGoal, plan, type Profile } from "../fitnessMath.js";

/**
 * 健身（减脂）：个人资料、体重和围度、饮食、运动、力量训练，加上概览用的汇总和每周一份的 AI 点评。
 * 各类记录的增删改查用通用的 crudRouter；这里只写它做不了的部分。
 */
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "日期格式不对");
const ymd = (d: Date) => d.toLocaleDateString("sv");
const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
/** 本周一 */
const weekStart = () => {
  const d = new Date();
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7));
  return d;
};

type Row = Record<string, string | number | null>;
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as Row | undefined;

export const fitnessRouter = Router();

// ---------- 个人资料 ----------
const profileSchema = z.object({
  sex: z.enum(["male", "female"]),
  birth_year: z.coerce.number().int().min(1920, "出生年份不对").max(new Date().getFullYear() - 10, "出生年份不对"),
  height_cm: z.coerce.number().min(100, "身高要在 100–250 厘米之间").max(250, "身高要在 100–250 厘米之间"),
  activity: z.enum(["sedentary", "light", "moderate", "active"]),
  target_weight: z.coerce.number().min(30, "目标体重要在 30–300 公斤之间").max(300, "目标体重要在 30–300 公斤之间"),
  weekly_loss: z.coerce.number().min(0).max(1, "每周最多减 1 公斤，再快对身体不好"),
});
const getProfile = (uid: number) => (one("SELECT sex, birth_year, height_cm, activity, target_weight, weekly_loss FROM fitness_profile WHERE user_id = ?", uid) as Profile | undefined) ?? null;

fitnessRouter.get("/profile", (req, res) => void res.json(getProfile(req.userId!)));
fitnessRouter.put("/profile", (req, res) => {
  const p = profileSchema.parse(req.body);
  db.prepare(
    `INSERT INTO fitness_profile (user_id, sex, birth_year, height_cm, activity, target_weight, weekly_loss) VALUES (?, ?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id) DO UPDATE SET sex = excluded.sex, birth_year = excluded.birth_year, height_cm = excluded.height_cm,
       activity = excluded.activity, target_weight = excluded.target_weight, weekly_loss = excluded.weekly_loss`,
  ).run(req.userId!, p.sex, p.birth_year, p.height_cm, p.activity, p.target_weight, p.weekly_loss);
  res.json(getProfile(req.userId!));
});

// ---------- 体重和围度 ----------
const bodySchema = z.object({
  date,
  weight: z.coerce.number().min(20, "体重要在 20–400 公斤之间").max(400, "体重要在 20–400 公斤之间"),
  waist: z.coerce.number().min(30).max(250).nullable().default(null),
  body_fat: z.coerce.number().min(2).max(70).nullable().default(null),
  note: z.string().max(200).default(""),
});
// 记一条：同一天已经记过就改成新的数字（一天一条）
fitnessRouter.post("/body", (req, res) => {
  const b = bodySchema.parse(req.body);
  db.prepare(
    `INSERT INTO body_logs (user_id, date, weight, waist, body_fat, note) VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT (user_id, date) DO UPDATE SET weight = excluded.weight, waist = excluded.waist, body_fat = excluded.body_fat, note = excluded.note`,
  ).run(req.userId!, b.date, b.weight, b.waist, b.body_fat, b.note);
  res.status(201).json(one("SELECT * FROM body_logs WHERE user_id = ? AND date = ?", req.userId!, b.date));
});
// 改日期时如果那天已经有一条，数据库会拒绝（UNIQUE），这里先查一下给个明白的提示
fitnessRouter.put("/body/:id", (req, res, next) => {
  const d = date.optional().parse(req.body?.date);
  if (d && one("SELECT 1 AS x FROM body_logs WHERE user_id = ? AND date = ? AND id != ?", req.userId!, d, Number(req.params.id))) {
    return void res.status(400).json({ error: `${d} 已经有一条记录了` });
  }
  next();
});
fitnessRouter.use("/body", crudRouter({ table: "body_logs", schema: bodySchema, orderBy: "date DESC" }));

// ---------- 饮食 ----------
// 自己填过的食物（名称 + 分量 + 热量），最近用的在前，下次可以直接选
fitnessRouter.get("/food/mine", (req, res) => {
  res.json(all("SELECT name, amount, kcal, MAX(id) AS last FROM food_logs WHERE user_id = ? GROUP BY name, amount, kcal ORDER BY last DESC LIMIT 60", req.userId!).map(({ name, amount, kcal }) => ({ name, amount, kcal })));
});
fitnessRouter.use(
  "/food",
  crudRouter({
    table: "food_logs",
    schema: z.object({
      date,
      meal: z.enum(["breakfast", "lunch", "dinner", "snack"]),
      name: z.string().trim().min(1, "写一下吃了什么").max(60),
      amount: z.string().trim().max(30).default(""),
      kcal: z.coerce.number().min(0, "热量不能为负").max(10000, "热量太大了，检查一下"),
    }),
    orderBy: "date DESC, id",
    filters: ["date"],
  }),
);

// ---------- 运动 ----------
fitnessRouter.use(
  "/workouts",
  crudRouter({
    table: "workouts",
    schema: z.object({
      date,
      type: z.string().trim().min(1, "选一下运动类型").max(20),
      minutes: z.coerce.number().int().min(1, "时长至少 1 分钟").max(1440, "一天最多 1440 分钟"),
      kcal: z.coerce.number().min(0).max(20000).default(0),
      note: z.string().max(200).default(""),
    }),
    orderBy: "date DESC, id DESC",
  }),
);

// ---------- 力量训练 ----------
// 做过哪些动作（做得多的在前）
fitnessRouter.get("/strength/exercises", (req, res) => {
  res.json(all("SELECT exercise, COUNT(*) AS n FROM strength_logs WHERE user_id = ? GROUP BY exercise ORDER BY n DESC, exercise", req.userId!).map((r) => r.exercise));
});
// 某个动作的进步：每个训练日用过的最大重量（自重动作重量都是 0，就看每组最多做了几次）
fitnessRouter.get("/strength/progress", (req, res) => {
  const { exercise } = z.object({ exercise: z.string().min(1).max(40) }).parse(req.query);
  res.json(all("SELECT date, MAX(weight) AS weight, MAX(reps) AS reps, SUM(reps * sets) AS total FROM strength_logs WHERE user_id = ? AND exercise = ? GROUP BY date ORDER BY date", req.userId!, exercise));
});
fitnessRouter.use(
  "/strength",
  crudRouter({
    table: "strength_logs",
    schema: z.object({
      date,
      exercise: z.string().trim().min(1, "写一下做的什么动作").max(40),
      weight: z.coerce.number().min(0, "重量不能为负").max(1000).default(0),
      reps: z.coerce.number().int().min(1, "每组至少 1 次").max(1000),
      sets: z.coerce.number().int().min(1, "至少 1 组").max(100),
    }),
    orderBy: "date DESC, id",
  }),
);

// ---------- 概览 ----------
/** 最近 n 天每天吃了多少千卡（没记的那天是 0） */
function intakeByDay(uid: number, n: number) {
  const got = new Map(all("SELECT date, SUM(kcal) AS kcal FROM food_logs WHERE user_id = ? AND date >= ? GROUP BY date", uid, daysAgo(n - 1)).map((r) => [r.date, Number(r.kcal)]));
  return Array.from({ length: n }, (_, i) => {
    const d = daysAgo(n - 1 - i);
    return { date: d, kcal: Math.round(got.get(d) ?? 0) };
  });
}

fitnessRouter.get("/overview", (req, res) => {
  const uid = req.userId!;
  const today = ymd(new Date());
  const monday = ymd(weekStart());

  const first = one("SELECT date, weight FROM body_logs WHERE user_id = ? ORDER BY date LIMIT 1", uid) ?? null;
  const latest = one("SELECT date, weight, waist, body_fat FROM body_logs WHERE user_id = ? ORDER BY date DESC LIMIT 1", uid) ?? null;
  const weights = all("SELECT date, weight FROM body_logs WHERE user_id = ? AND date >= ? ORDER BY date", uid, daysAgo(179));
  // 腰围和体脂率不是每次都记，所以各自找"最近一次记了的"和"第一次记了的"（用来算变化）
  const measure = (col: "waist" | "body_fat") => {
    const last = one(`SELECT date, ${col} AS value FROM body_logs WHERE user_id = ? AND ${col} IS NOT NULL ORDER BY date DESC LIMIT 1`, uid);
    if (!last) return null;
    const firstOne = one(`SELECT date, ${col} AS value FROM body_logs WHERE user_id = ? AND ${col} IS NOT NULL ORDER BY date LIMIT 1`, uid)!;
    return { date: last.date, value: last.value, firstDate: firstOne.date, firstValue: firstOne.value };
  };

  const eaten = Number(one("SELECT COALESCE(SUM(kcal), 0) AS n FROM food_logs WHERE user_id = ? AND date = ?", uid, today)!.n);
  const burnedToday = Number(one("SELECT COALESCE(SUM(kcal), 0) AS n FROM workouts WHERE user_id = ? AND date = ?", uid, today)!.n);
  const week = one("SELECT COUNT(*) AS count, COALESCE(SUM(minutes), 0) AS minutes, COALESCE(SUM(kcal), 0) AS kcal, COUNT(DISTINCT date) AS days FROM workouts WHERE user_id = ? AND date >= ?", uid, monday)!;

  // 最近 8 周每周运动了多少分钟（一周从周一算起）
  const byDay = new Map(all("SELECT date, SUM(minutes) AS m FROM workouts WHERE user_id = ? AND date >= ? GROUP BY date", uid, daysAgo(70)).map((r) => [String(r.date), Number(r.m)]));
  const workoutWeeks = Array.from({ length: 8 }, (_, i) => {
    const start = weekStart();
    start.setDate(start.getDate() - (7 - i) * 7);
    let minutes = 0;
    for (let k = 0; k < 7; k++) {
      const d = new Date(start);
      d.setDate(d.getDate() + k);
      minutes += byDay.get(ymd(d)) ?? 0;
    }
    return { start: ymd(start), minutes };
  });

  res.json({
    profile: getProfile(uid),
    first,
    latest,
    waist: measure("waist"),
    bodyFat: measure("body_fat"),
    weights,
    today: { date: today, eaten: Math.round(eaten), burned: Math.round(burnedToday) },
    week: { count: Number(week.count), minutes: Number(week.minutes), kcal: Math.round(Number(week.kcal)), days: Number(week.days) },
    intake14: intakeByDay(uid, 14),
    workoutWeeks,
  });
});

// ---------- AI 点评 ----------
// 点评看的是最近 7 天（含今天）。不按"周一到今天"算，是因为那样周一、周二点开几乎没有东西可评。
// 每次生成按起始日期存一份（同一天重新生成就覆盖），页面上显示最近生成的那一份。
const reviewRange = () => ({ start: daysAgo(6), end: ymd(new Date()) });
const latestReview = (uid: number) =>
  one("SELECT content, model, start_date AS start, end_date AS end, created_at AS createdAt FROM fitness_reviews WHERE user_id = ? ORDER BY created_at DESC LIMIT 1", uid) ?? null;

/** 把这 7 天的记录整理成文字材料。没有资料或者这 7 天什么都没记时返回一句说明原因的话（error） */
function reviewMaterial(uid: number, start: string, end: string): { text: string } | { error: string } {
  const p = getProfile(uid);
  if (!p) return { error: "先在「概览」里填好个人资料。" };
  const latest = one("SELECT date, weight, waist, body_fat FROM body_logs WHERE user_id = ? ORDER BY date DESC LIMIT 1", uid);
  if (!latest) return { error: "先记一次体重，才能算出你的基础代谢和建议摄入。" };

  const weight = Number(latest.weight);
  const pl = plan(p, weight);
  const first = one("SELECT date, weight FROM body_logs WHERE user_id = ? ORDER BY date LIMIT 1", uid)!;
  const toGo = daysToGoal(weight, p.target_weight, p.weekly_loss);
  const parts: string[] = [
    `【基本情况】${p.sex === "male" ? "男" : "女"}，${pl.age} 岁，身高 ${p.height_cm} cm，平时活动量：${ACTIVITY[p.activity].label}（${ACTIVITY[p.activity].hint}）。
现在体重 ${weight} kg（${latest.date} 记的），BMI ${pl.bmi}（${bmiLabel(pl.bmi)}）${latest.waist ? `，腰围 ${latest.waist} cm` : ""}${latest.body_fat ? `，体脂率 ${latest.body_fat}%` : ""}。
起始体重 ${first.weight} kg（${first.date}），目标体重 ${p.target_weight} kg，计划每周减 ${p.weekly_loss} kg${toGo ? `，按计划还要约 ${toGo} 天` : toGo === 0 ? "，已经达到目标" : ""}。
估算：基础代谢 ${pl.bmr} 千卡，每日总消耗 ${pl.tdee} 千卡，建议每日摄入 ${pl.intake} 千卡${pl.capped ? "（已经是安全下限，说明计划的减重速度偏快）" : ""}。`,
  ];
  let recorded = 0;

  const weights = all("SELECT date, weight FROM body_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date", uid, daysAgo(20), end);
  if (weights.length > 1) parts.push(`【最近三周的体重】${weights.map((w) => `${String(w.date).slice(5)} ${w.weight}kg`).join("，")}`);
  recorded += weights.filter((w) => String(w.date) >= start).length;

  const food = all("SELECT date, meal, name, amount, kcal FROM food_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id", uid, start, end);
  if (food.length) {
    const MEAL: Record<string, string> = { breakfast: "早", lunch: "午", dinner: "晚", snack: "加餐" };
    const days = new Map<string, Row[]>();
    for (const f of food) days.set(String(f.date), [...(days.get(String(f.date)) ?? []), f]);
    const lines = [...days].map(([d, list]) => {
      const total = Math.round(list.reduce((n, f) => n + Number(f.kcal), 0));
      return `- ${d.slice(5)} 共 ${total} 千卡（${total > pl.intake ? `超出 ${total - pl.intake}` : `低于建议 ${pl.intake - total}`}）：${list.map((f) => `${MEAL[String(f.meal)]}·${f.name}${f.amount ? ` ${f.amount}` : ""} ${Math.round(Number(f.kcal))}`).join("；")}`;
    });
    parts.push(`【这 7 天的饮食】记了 ${days.size} 天：\n${lines.join("\n")}`);
    recorded += food.length;
  }

  const workouts = all("SELECT date, type, minutes, kcal, note FROM workouts WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id", uid, start, end);
  if (workouts.length) {
    parts.push(`【这 7 天的运动】共 ${workouts.length} 次，${workouts.reduce((n, w) => n + Number(w.minutes), 0)} 分钟：${workouts.map((w) => `${String(w.date).slice(5)} ${w.type} ${w.minutes} 分钟（约 ${Math.round(Number(w.kcal))} 千卡）${w.note ? `，${w.note}` : ""}`).join("；")}`);
    recorded += workouts.length;
  }

  const strength = all("SELECT date, exercise, weight, reps, sets FROM strength_logs WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date, id", uid, start, end);
  if (strength.length) {
    parts.push(`【这 7 天的力量训练】${strength.map((s) => `${String(s.date).slice(5)} ${s.exercise} ${Number(s.weight) ? `${s.weight}kg × ` : ""}${s.reps} 次 × ${s.sets} 组`).join("；")}`);
    recorded += strength.length;
  }

  if (recorded === 0) return { error: "最近 7 天还没有任何体重、饮食或运动记录，没有可以点评的内容。" };
  return { text: parts.join("\n\n") };
}

const REVIEW_PROMPT = `你是一位讲究科学、说话实在的减脂教练。下面是用户最近 7 天在自己的健身记录页面上记下的内容，以及按通用公式估算出的基础数字。请写一份这 7 天的点评和接下来一周的建议。

要求：
- 只根据给出的记录来写，不要编造没有的数据；没有记录的方面可以提醒一句"这几天没有记 XX"，但不要展开。
- 先用一小节说这 7 天整体做得怎么样（体重变化、热量控制、运动量），要有具体数字。
- 再指出一两个最值得改进的地方，说清楚为什么。
- 最后一小节给接下来一周三条以内具体、可执行的建议（例如哪一餐可以怎么换、加一次什么运动）。
- 不要建议每日摄入低于材料里给出的"建议每日摄入"，不要推荐极端节食、断食、药物或保健品。减重速度明显过快（每周超过体重的 1%）时要提醒放慢。
- 语气像朋友提醒，平实直接，不说空话。称呼用户为"你"。
- 篇幅 300 到 500 字。

输出格式要求：
- 用简体中文。
- 分成几个小节，每个小节的标题单独一行，以"## "开头。
- 要点用以"- "开头的列表，其余用普通段落。
- 除了"## "和"- "以外不要用任何 Markdown 记号（不要加粗、不要表格、不要代码块）。
- 直接写正文，不要开场白和结束语。`;

const reviewing = new Set<number>(); // 正在生成点评的账号，防止连点

fitnessRouter.get("/review", (req, res) => {
  res.json({ ...aiStatus(), range: reviewRange(), summary: latestReview(req.userId!) });
});

fitnessRouter.post("/review", async (req, res) => {
  const uid = req.userId!;
  if (!aiStatus().configured) return void res.status(400).json({ error: "还没有配置 AI 模型。在项目根目录的 .env 文件里填好 AI_BASE_URL、AI_API_KEY、AI_MODEL，然后重启网站。" });
  const { start, end } = reviewRange();
  const material = reviewMaterial(uid, start, end);
  if ("error" in material) return void res.status(400).json({ error: material.error });
  if (reviewing.has(uid)) return void res.status(409).json({ error: "正在生成，稍等一下。" });
  reviewing.add(uid);
  try {
    // 流式返回（见 aiStream.ts）：边写边发，写完存下来；中途关掉窗口就停下、不保存
    await streamReply(req, res, async (onText, signal) => {
      const { text, model } = await chatStream(REVIEW_PROMPT, [{ role: "user", content: `时间范围：${start} 至 ${end}（最近 7 天）\n\n${material.text}` }], 0.5, onText, signal);
      db.prepare(
        `INSERT INTO fitness_reviews (user_id, start_date, end_date, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, start_date) DO UPDATE SET end_date = excluded.end_date, content = excluded.content, model = excluded.model, created_at = excluded.created_at`,
      ).run(uid, start, end, text.slice(0, 20_000), model, new Date().toISOString());
      return { summary: latestReview(uid) };
    });
  } finally {
    reviewing.delete(uid);
  }
});
