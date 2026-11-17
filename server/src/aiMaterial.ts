import { db } from "./db.js";
import { ACTIVITY, bmiLabel, plan, type Profile } from "./fitnessMath.js";

/**
 * 把数据库里的记录整理成给 AI 看的文字材料。
 *   buildSnapshot(uid)   所有记录的概要（「问我的数据」用）
 *   PAGES[页面].material  某一个页面的内容，比概要更细（每个页面自己的助手用）
 * 这里只读数据库、不写；除了 GitHub 热门榜单（所有账号共用），都只读传进来的这个账号的数据。
 */
export const ymd = (d: Date) => d.toLocaleDateString("sv");
export const daysAgo = (n: number) => {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return ymd(d);
};
export const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const flat = (s: unknown, n: number) => cut(String(s ?? "").replace(/\s+/g, " ").trim(), n);
const WEEKDAY = ["日", "一", "二", "三", "四", "五", "六"];
/** 告诉模型今天是哪天：它自己不知道日期，"明天""上周五"都要靠这个推 */
export const todayLine = () => `今天是 ${ymd(new Date())}，星期${WEEKDAY[new Date().getDay()]}。`;

type Row = Record<string, string | number | null>;
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];
const one = (sql: string, ...args: (string | number)[]) => db.prepare(sql).get(...args) as Row | undefined;

export const SNAPSHOT_DAYS = 90;
const MATERIAL_MAX = 24_000; // 一份材料最多多少字，太长既费钱又容易让模型看漏
const cap = (parts: string[], empty: string) => cut(parts.filter(Boolean).join("\n\n") || empty, MATERIAL_MAX);

// 每一块都有两种详细程度：概要（放进「问我的数据」的总材料里）和详细（这个页面自己的助手用）
type Depth = "brief" | "full";

function tasksPart(uid: number, depth: Depth): string {
  const since = daysAgo(SNAPSHOT_DAYS - 1);
  const today = ymd(new Date());
  const PRI: Record<string, string> = { high: "高", medium: "中", low: "低" };
  const full = depth === "full";
  const open = all(`SELECT title, description, status, priority, due_date, substr(created_at, 1, 10) AS c FROM tasks WHERE user_id = ? AND status != 'done' ORDER BY due_date IS NULL, due_date LIMIT ${full ? 120 : 60}`, uid);
  const done = all(`SELECT title, substr(updated_at, 1, 10) AS d FROM tasks WHERE user_id = ? AND status = 'done' AND substr(updated_at, 1, 10) >= ? ORDER BY updated_at DESC LIMIT ${full ? 100 : 60}`, uid, since);
  if (!open.length && !done.length) return "";
  const lines = ["【工作任务】"];
  if (open.length)
    lines.push(
      `没完成的（${open.length} 个）：`,
      ...open.map(
        (t) =>
          `- ${t.title}｜${t.status === "doing" ? "进行中" : "待办"}｜优先级${PRI[String(t.priority)]}｜${t.due_date ? `截止 ${t.due_date}${String(t.due_date) < today ? "（已逾期）" : ""}` : "没设截止日期"}` +
          (full ? `｜${t.c} 建的${t.description ? `｜描述：${flat(t.description, 160)}` : ""}` : ""),
      ),
    );
  if (done.length) lines.push(`最近 ${SNAPSHOT_DAYS} 天完成的（${done.length} 个，日期是完成那天）：`, ...done.map((t) => `- ${t.d} ${t.title}`));
  return lines.join("\n");
}

function lifePart(uid: number, depth: Depth): string {
  const todo = all(`SELECT title, category, date FROM life_items WHERE user_id = ? AND done = 0 ORDER BY date IS NULL, date LIMIT ${depth === "full" ? 100 : 40}`, uid);
  const lines: string[] = [];
  if (todo.length) lines.push(`【生活清单里没做的（${todo.length} 件）】`, ...todo.map((x) => `- ${x.title}｜${x.category}${x.date ? `｜${x.date}` : ""}`));
  if (depth === "full") {
    const done = all("SELECT title, category FROM life_items WHERE user_id = ? AND done = 1 ORDER BY id DESC LIMIT 30", uid);
    if (done.length) lines.push(`【生活清单里已经做完的（最近 ${done.length} 件）】`, ...done.map((x) => `- ${x.title}｜${x.category}`));
  }
  return lines.join("\n");
}

/** 收支：按月按分类的合计（数字已经加好，模型直接读），加上最近一段时间的明细 */
function moneyPart(uid: number, depth: Depth): string {
  const since = daysAgo(SNAPSHOT_DAYS - 1);
  const byMonth = all("SELECT substr(date, 1, 7) AS m, type, category, ROUND(SUM(amount), 2) AS total, COUNT(*) AS n FROM expenses WHERE user_id = ? AND date >= ? GROUP BY m, type, category ORDER BY m DESC, total DESC", uid, since);
  if (!byMonth.length) return "";
  const months = [...new Set(byMonth.map((r) => String(r.m)))];
  const lines = [`【收支】最近 ${SNAPSHOT_DAYS} 天，按月合计（元）：`];
  for (const m of months) {
    const rows = byMonth.filter((r) => r.m === m);
    const sum = (type: string) => rows.filter((r) => r.type === type).reduce((n, r) => n + Number(r.total), 0);
    lines.push(`- ${m}：收入 ${sum("income").toFixed(2)}，支出 ${sum("expense").toFixed(2)}。支出分类：${rows.filter((r) => r.type === "expense").map((r) => `${r.category} ${r.total}（${r.n} 笔）`).join("，") || "无"}`);
  }
  const days = depth === "full" ? SNAPSHOT_DAYS : 30;
  const recent = all(`SELECT date, type, category, amount, note FROM expenses WHERE user_id = ? AND date >= ? ORDER BY date DESC, id DESC LIMIT ${depth === "full" ? 300 : 150}`, uid, daysAgo(days - 1));
  if (recent.length) lines.push(`最近 ${days} 天的明细：`, ...recent.map((e) => `- ${e.date} ${e.type === "income" ? "收入" : "支出"} ${e.amount} ${e.category}${e.note ? `（${e.note}）` : ""}`));
  return lines.join("\n");
}

function journalPart(uid: number, depth: Depth): string {
  const [limit, chars] = depth === "full" ? [60, 500] : [40, 200];
  const rows = all(`SELECT date, mood, title, tags, content FROM journals WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT ${limit}`, uid, daysAgo(SNAPSHOT_DAYS - 1));
  if (!rows.length) return "";
  return `【随记】最近 ${SNAPSHOT_DAYS} 天 ${rows.length} 篇（日期、心情、标题、标签、正文开头）：\n${rows.map((j) => `- ${j.date} ${j.mood}《${j.title}》${j.tags ? `[${j.tags}]` : ""} ${flat(j.content, chars)}`).join("\n")}`;
}

function fitnessPart(uid: number, depth: Depth): string {
  const since = daysAgo(SNAPSHOT_DAYS - 1);
  const profile = one("SELECT sex, birth_year, height_cm, activity, target_weight, weekly_loss FROM fitness_profile WHERE user_id = ?", uid) as Profile | undefined;
  const weights = all("SELECT date, weight, waist, body_fat FROM body_logs WHERE user_id = ? AND date >= ? ORDER BY date", uid, since);
  const latest = one("SELECT weight FROM body_logs WHERE user_id = ? ORDER BY date DESC LIMIT 1", uid);
  const fit: string[] = [];
  if (profile && latest) {
    const pl = plan(profile, Number(latest.weight));
    fit.push(`资料：${profile.sex === "male" ? "男" : "女"}，${pl.age} 岁，身高 ${profile.height_cm} cm，活动量${ACTIVITY[profile.activity].label}；目标体重 ${profile.target_weight} kg，计划每周减 ${profile.weekly_loss} kg。估算：基础代谢 ${pl.bmr}，每日消耗 ${pl.tdee}，建议每日摄入 ${pl.intake} 千卡；BMI ${pl.bmi}（${bmiLabel(pl.bmi)}）。`);
  }
  if (weights.length) fit.push(`体重记录：${weights.map((w) => `${String(w.date).slice(5)} ${w.weight}kg${w.waist ? ` 腰围${w.waist}` : ""}${w.body_fat ? ` 体脂${w.body_fat}%` : ""}`).join("；")}`);
  const intake = all("SELECT date, ROUND(SUM(kcal)) AS kcal FROM food_logs WHERE user_id = ? AND date >= ? GROUP BY date ORDER BY date", uid, daysAgo(29));
  if (intake.length) fit.push(`最近 30 天每天吃了多少千卡（只列记了的日子）：${intake.map((d) => `${String(d.date).slice(5)} ${d.kcal}`).join("；")}`);
  const foodDays = depth === "full" ? 14 : 7;
  const foods = all(`SELECT date, meal, name, amount, kcal FROM food_logs WHERE user_id = ? AND date >= ? ORDER BY date DESC, id LIMIT ${depth === "full" ? 200 : 80}`, uid, daysAgo(foodDays - 1));
  if (foods.length) {
    const MEAL: Record<string, string> = { breakfast: "早", lunch: "午", dinner: "晚", snack: "加餐" };
    fit.push(`最近 ${foodDays} 天吃的东西：${foods.map((f) => `${String(f.date).slice(5)} ${MEAL[String(f.meal)]}·${f.name}${f.amount ? ` ${f.amount}` : ""} ${Math.round(Number(f.kcal))}`).join("；")}`);
  }
  const workouts = all("SELECT date, type, minutes, kcal, note FROM workouts WHERE user_id = ? AND date >= ? ORDER BY date DESC LIMIT 80", uid, since);
  if (workouts.length) fit.push(`运动记录：${workouts.map((w) => `${String(w.date).slice(5)} ${w.type} ${w.minutes} 分钟${Number(w.kcal) ? ` 约${Math.round(Number(w.kcal))}千卡` : ""}${depth === "full" && w.note ? `（${flat(w.note, 40)}）` : ""}`).join("；")}`);
  const strength = all(`SELECT date, exercise, weight, reps, sets FROM strength_logs WHERE user_id = ? AND date >= ? ORDER BY date DESC, id LIMIT ${depth === "full" ? 160 : 80}`, uid, since);
  if (strength.length) fit.push(`力量训练：${strength.map((s) => `${String(s.date).slice(5)} ${s.exercise} ${Number(s.weight) ? `${s.weight}kg×` : ""}${s.reps}次×${s.sets}组`).join("；")}`);
  return fit.length ? `【健身】\n${fit.join("\n")}` : "";
}

function countdownPart(uid: number): string {
  const rows = all("SELECT title, date FROM countdowns WHERE user_id = ? AND date >= ? ORDER BY date LIMIT 20", uid, ymd(new Date()));
  return rows.length ? `【倒计时】\n${rows.map((c) => `- ${c.date} ${c.title}`).join("\n")}` : "";
}

/** 资讯：订阅的来源里最新的 100 篇。只有标题和开头的摘要，没有全文 */
function newsPart(uid: number): string {
  const rows = all(
    `SELECT a.title, a.title_zh, a.summary, a.ai_summary, a.published_at, a.read, f.title AS feed, f.topic
     FROM articles a JOIN feeds f ON f.id = a.feed_id
     WHERE a.user_id = ? AND f.enabled = 1 ORDER BY a.published_at DESC, a.id DESC LIMIT 100`,
    uid,
  );
  if (!rows.length) return "";
  const day = (iso: unknown) => ymd(new Date(String(iso))).slice(5);
  return `【资讯】最新的 ${rows.length} 篇，从新到旧（格式：[主题·来源] 发布日期 标题 —— 摘要）：\n${rows
    .map((a) => {
      const about = flat(a.ai_summary || a.summary, a.ai_summary ? 300 : 90);
      return `- [${a.topic || "未分类"}·${a.feed}] ${day(a.published_at)} ${flat(a.title, 140)}${a.title_zh ? `（${flat(a.title_zh, 80)}）` : ""}${a.read ? "" : "｜未读"}${about ? ` —— ${about}` : ""}`;
    })
    .join("\n")}`;
}

/** GitHub 热门：最近一天的榜单。这张表所有账号共用，没有个人数据 */
function trendingPart(): string {
  const last = one("SELECT date FROM trending_days ORDER BY date DESC LIMIT 1");
  if (!last) return "";
  const rows = all("SELECT rank, full_name, description, language, stars, stars_today, category FROM trending WHERE date = ? ORDER BY rank LIMIT 50", String(last.date));
  if (!rows.length) return "";
  return `【GitHub 热门】${last.date} 的榜单，共 ${rows.length} 个项目（格式：名次. 项目｜语言｜总星标（今天新增）｜分类｜简介）：\n${rows
    .map((r) => `${r.rank}. ${r.full_name}｜${r.language || "未标语言"}｜★${r.stars}（今天 +${r.stars_today}）｜${r.category || "未分类"}｜${flat(r.description, 200) || "没有简介"}`)
    .join("\n")}`;
}

const host = (url: unknown) => {
  try {
    return new URL(String(url)).host;
  } catch {
    return "";
  }
};

function favoritesPart(uid: number): string {
  const KIND: Record<string, string> = { text: "摘录", image: "图片", video: "视频" };
  const total = Number(one("SELECT COUNT(*) AS n FROM favorites WHERE user_id = ?", uid)?.n ?? 0);
  if (!total) return "";
  const rows = all("SELECT kind, title, url, content, grp, tags, pinned, substr(created_at, 1, 10) AS d FROM favorites WHERE user_id = ? ORDER BY pinned DESC, id DESC LIMIT 200", uid);
  return `【收藏】一共 ${total} 条${total > rows.length ? `，下面是最近的 ${rows.length} 条` : ""}（格式：[类型] 标题｜分组｜标签｜来源网站｜内容开头｜收藏日期）：\n${rows
    .map((f) => `- [${KIND[String(f.kind)] ?? f.kind}] ${flat(f.title, 100) || "（没有标题）"}｜${f.grp || "未分组"}｜${f.tags || "没有标签"}｜${host(f.url) || "无链接"}｜${flat(f.content, 120) || "—"}｜${f.d}${f.pinned ? "｜置顶" : ""}`)
    .join("\n")}`;
}

function sitesPart(uid: number): string {
  const rows = all("SELECT title, url, category, pinned FROM sites WHERE user_id = ? ORDER BY pinned DESC, id LIMIT 300", uid);
  if (!rows.length) return "";
  return `【网址】一共 ${rows.length} 个（格式：名称｜地址｜分类）：\n${rows.map((s) => `- ${flat(s.title, 60) || host(s.url)}｜${flat(s.url, 100)}｜${s.category || "未分类"}${s.pinned ? "｜常用" : ""}`).join("\n")}`;
}

function commandsPart(uid: number): string {
  const rows = all("SELECT name, args, aliases, category, description, example, note, pinned, builtin FROM commands WHERE user_id = ? ORDER BY category, id LIMIT 200", uid);
  if (!rows.length) return "";
  return `【命令】一共 ${rows.length} 条（格式：命令 参数｜分类｜说明｜例子｜用户自己的备注）：\n${rows
    .map(
      (c) =>
        `- ${c.name}${c.args ? ` ${c.args}` : ""}${c.aliases ? `（别名 ${c.aliases}）` : ""}｜${c.category || "未分类"}｜${flat(c.description, 140)}` +
        `${c.example ? `｜例：${flat(c.example, 80)}` : ""}${c.note ? `｜备注：${flat(c.note, 80)}` : ""}${c.pinned ? "｜常用" : ""}${c.builtin ? "" : "｜用户自己加的"}`,
    )
    .join("\n")}`;
}

/** 把这个账号最近 90 天的记录整理成一份概要（「问我的数据」用） */
export function buildSnapshot(uid: number): string {
  return cap([tasksPart(uid, "brief"), lifePart(uid, "brief"), moneyPart(uid, "brief"), journalPart(uid, "brief"), fitnessPart(uid, "brief")], "（这个用户最近没有任何记录。）");
}

/**
 * 每个页面的助手：
 *   name      页面名
 *   covers    材料里有什么（写进提示词，让模型知道自己能看到的范围）
 *   material  整理这个页面的内容
 *   guide     这个页面特有的要求
 */
type PageSpec = { name: string; covers: string; material: (uid: number) => string; guide: string };

export const PAGES = {
  dashboard: {
    name: "总览",
    covers: `最近 ${SNAPSHOT_DAYS} 天的工作任务、生活清单、收支、随记、健身记录，以及还没到的倒计时`,
    material: (uid) => cap([countdownPart(uid), tasksPart(uid, "brief"), lifePart(uid, "brief"), moneyPart(uid, "brief"), journalPart(uid, "brief"), fitnessPart(uid, "brief")], "（这个用户最近没有任何记录。）"),
    guide: "用户问该先做什么、有什么落下了的时候，结合截止日期、优先级、是否逾期，给出具体的先后顺序，最多列 5 件，每件说一句为什么。",
  },
  work: {
    name: "工作",
    covers: `所有没完成的任务（含描述、优先级、截止日期）和最近 ${SNAPSHOT_DAYS} 天完成的任务`,
    material: (uid) => cap([tasksPart(uid, "full")], "（任务列表是空的。）"),
    guide: "可以给做事的先后顺序和拆分建议，但要分清哪些是记录里的事实、哪些是你的建议。排顺序时先看逾期和截止日期，再看优先级。",
  },
  life: {
    name: "生活",
    covers: `生活清单（没做的和最近做完的）、最近 ${SNAPSHOT_DAYS} 天的收支（按月按分类的合计和每一笔明细）`,
    material: (uid) => cap([lifePart(uid, "full"), moneyPart(uid, "full")], "（生活清单和记账都是空的。）"),
    guide: "按月按分类的合计已经算好，直接用，不要自己重加。给省钱建议时要基于明细里实际出现的开销，不要泛泛而谈。",
  },
  fitness: {
    name: "健身",
    covers: `个人资料和按公式估算的代谢、最近 ${SNAPSHOT_DAYS} 天的体重和围度、最近 30 天每天的摄入、最近 14 天吃的东西、运动和力量训练记录`,
    material: (uid) => cap([fitnessPart(uid, "full")], "（健身页面还没有任何记录。）"),
    guide: "基础代谢、每日消耗、建议摄入已经按公式算好，直接用。可以给饮食和训练建议，但你不是医生：不做诊断，遇到伤病、用药、极端节食这类问题，提醒用户去问医生。",
  },
  journal: {
    name: "随记",
    covers: `最近 ${SNAPSHOT_DAYS} 天的随记（日期、心情、标题、标签、正文的前 500 字）`,
    material: (uid) => cap([journalPart(uid, "full")], "（最近没有写随记。）"),
    guide: "归纳心情和反复出现的主题时，说清楚是哪一天的哪一篇。语气平和、像朋友，不说教，不做心理诊断。",
  },
  news: {
    name: "资讯",
    covers: "用户订阅的新闻来源里最新的 100 篇文章（主题、来源、日期、标题、开头的摘要、读没读过）",
    material: (uid) => cap([newsPart(uid)], "（资讯列表是空的，可能还没刷新过。）"),
    guide: "你只看得到标题和开头的摘要，没读过全文：归纳时以它们为准，不要补充文章里没写的细节。可以用你自己的知识解释背景，但要说明那是背景知识、不是文章内容。推荐文章时写出标题，方便用户在页面上找到。",
  },
  trending: {
    name: "GitHub 热门",
    covers: "最近一天的 GitHub 热门榜单（名次、项目名、语言、星标数、分类、简介）",
    material: () => cap([trendingPart()], "（榜单是空的，可能还没刷新过。）"),
    guide: "介绍项目时以榜单上的简介为准。可以用你已有的知识补充，但要说明那是你的了解、可能已经过时。推荐项目时写出完整的项目名（owner/repo）。",
  },
  favorites: {
    name: "收藏",
    covers: "用户的收藏（类型、标题、分组、标签、来源网站、内容开头、收藏日期）；图片和视频本身你看不到",
    material: (uid) => cap([favoritesPart(uid)], "（收藏夹是空的。）"),
    guide: "帮用户找东西或整理时，写出条目的标题，方便他在页面上搜到。建议分组和标签时优先用他已经在用的名字。",
  },
  sites: {
    name: "网址",
    covers: "用户存的常用网址（名称、地址、分类）",
    material: (uid) => cap([sitesPart(uid)], "（还没有存任何网址。）"),
    guide: "建议分类时优先用他已有的分类名。可以根据你的了解说明某个网站是做什么的，但只推荐他列表里已有的网址，除非他明确要你推荐新的。",
  },
  commands: {
    name: "命令",
    covers: "用户存的 Claude Code 斜杠命令速查表（命令、参数、分类、说明、例子、备注）",
    material: (uid) => cap([commandsPart(uid)], "（命令表是空的。）"),
    guide: "用户描述想做的事时，从表里找出最合适的命令，写出完整写法，再用一句话说明。表里没有合适的就直说没有，不要编一个不存在的命令。",
  },
} satisfies Record<string, PageSpec>;

export type PageKey = keyof typeof PAGES;
export const PAGE_KEYS = Object.keys(PAGES) as [PageKey, ...PageKey[]];
