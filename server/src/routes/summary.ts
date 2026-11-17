import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { aiStatus, chatStream } from "../ai.js";
import { streamReply } from "../aiStream.js";

/**
 * AI 总结：按一下按钮，把一段时间（今天 / 本周 / 本月）的内容整理成文字材料交给模型，让它写一份总结。
 *   kind = personal  总结自己的记录：任务、收支、随记、生活清单
 *   kind = news      总结「资讯」里这段时间的文章
 * 写好的总结存在 summaries 表里，下次打开直接看；重新生成会覆盖同一时间段的那一份。
 * 注意：生成时这些材料会发给 .env 里配置的那家模型服务。
 */
type Kind = "personal" | "news";
type Period = "day" | "week" | "month";

const PERIOD_NAME: Record<Period, string> = { day: "今天", week: "本周", month: "本月" };
const MAX_ARTICLES = 120; // 一次最多给模型看多少篇文章
const cut = (s: string, n: number) => (s.length > n ? `${s.slice(0, n)}…` : s);
const ymd = (d: Date) => d.toLocaleDateString("sv"); // 本地时间的 YYYY-MM-DD

/** 这个时间段从哪天到哪天：周从周一算起，月从 1 号算起，都到今天为止 */
function rangeOf(period: Period): { start: string; end: string; days: number } {
  const now = new Date();
  const first = new Date(now.getFullYear(), now.getMonth(), now.getDate());
  if (period === "week") first.setDate(first.getDate() - ((first.getDay() + 6) % 7));
  if (period === "month") first.setDate(1);
  const days = Math.round((new Date(now.getFullYear(), now.getMonth(), now.getDate()).getTime() - first.getTime()) / 86_400_000) + 1;
  return { start: ymd(first), end: ymd(now), days };
}

type Row = Record<string, string | number | null>;
const all = (sql: string, ...args: (string | number)[]) => db.prepare(sql).all(...args) as Row[];

// ---------- 整理材料 ----------
/** 自己的记录。这段时间什么都没记时返回 null */
function personalMaterial(uid: number, start: string, end: string): string | null {
  const parts: string[] = [];
  const PRI: Record<string, string> = { high: "高", medium: "中", low: "低" };

  // 工作：任务没有单独的"完成时间"，用最后修改时间当作完成的时间
  const done = all("SELECT title, priority FROM tasks WHERE user_id = ? AND status = 'done' AND substr(updated_at, 1, 10) BETWEEN ? AND ? ORDER BY updated_at", uid, start, end);
  const created = all("SELECT COUNT(*) AS n FROM tasks WHERE user_id = ? AND substr(created_at, 1, 10) BETWEEN ? AND ?", uid, start, end)[0].n as number;
  const open = all("SELECT title, priority, status, due_date FROM tasks WHERE user_id = ? AND status != 'done' ORDER BY status DESC, due_date IS NULL, due_date LIMIT 30", uid);
  if (done.length || created) {
    const lines = [`【工作】这段时间新建 ${created} 个任务，完成 ${done.length} 个。`];
    if (done.length) lines.push(`完成的：${done.map((t) => `${t.title}（优先级${PRI[String(t.priority)]}）`).join("；")}`);
    if (open.length) {
      lines.push(
        `目前还没完成的：${open
          .map((t) => `${t.title}（${t.status === "doing" ? "进行中" : "待办"}${t.due_date ? `，截止 ${t.due_date}${String(t.due_date) < end ? "，已逾期" : ""}` : ""}）`)
          .join("；")}`,
      );
    }
    parts.push(lines.join("\n"));
  }

  // 收支
  const money = all("SELECT type, category, SUM(amount) AS total, COUNT(*) AS n FROM expenses WHERE user_id = ? AND date BETWEEN ? AND ? GROUP BY type, category ORDER BY total DESC", uid, start, end);
  if (money.length) {
    const sum = (type: string) => money.filter((m) => m.type === type).reduce((n, m) => n + Number(m.total), 0);
    const list = (type: string) =>
      money
        .filter((m) => m.type === type)
        .map((m) => `${m.category} ${Number(m.total).toFixed(2)} 元（${m.n} 笔）`)
        .join("；");
    parts.push(`【收支】收入 ${sum("income").toFixed(2)} 元，支出 ${sum("expense").toFixed(2)} 元。${list("expense") ? `\n支出按分类：${list("expense")}` : ""}${list("income") ? `\n收入按分类：${list("income")}` : ""}`);
  }

  // 随记
  const journals = all("SELECT date, mood, title, content, tags FROM journals WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date LIMIT 40", uid, start, end);
  if (journals.length) parts.push(`【随记】写了 ${journals.length} 篇。\n${journals.map((j) => `- ${String(j.date).slice(5)} ${j.mood}《${j.title}》${j.tags ? `（标签：${j.tags}）` : ""}：${cut(String(j.content), 500)}`).join("\n")}`);

  // 生活清单：只看日期落在这段时间里的
  const life = all("SELECT title, category, done FROM life_items WHERE user_id = ? AND date BETWEEN ? AND ? ORDER BY date LIMIT 60", uid, start, end);
  if (life.length) {
    const names = (d: number) => life.filter((x) => Number(x.done) === d).map((x) => `${x.title}（${x.category}）`).join("；");
    parts.push(`【生活清单】安排在这段时间的事项 ${life.length} 件。${names(1) ? `\n做完的：${names(1)}` : ""}${names(0) ? `\n还没做的：${names(0)}` : ""}`);
  }

  return parts.length ? parts.join("\n\n") : null;
}

/** 有的来源的"摘要"只是一句"点击查看原文"，这种不给模型看 */
const useful = (summary: unknown) => typeof summary === "string" && summary.length > 12 && !/^(点击)?(查看|阅读)(原文|全文)/.test(summary);

/** 资讯：这段时间发布的文章（只看没停用的来源），最新的若干篇 */
function newsMaterial(uid: number, start: string): { text: string; count: number } | null {
  const [y, m, d] = start.split("-").map(Number);
  const since = new Date(y, m - 1, d).toISOString(); // published_at 存的是 UTC 时间
  const rows = all(
    `SELECT a.title, a.summary, f.title AS feed, f.topic FROM articles a JOIN feeds f ON f.id = a.feed_id
     WHERE a.user_id = ? AND f.enabled = 1 AND a.published_at >= ? ORDER BY a.published_at DESC LIMIT ?`,
    uid,
    since,
    MAX_ARTICLES,
  );
  if (!rows.length) return null;
  const text = rows.map((a, i) => `${i + 1}. [${a.topic || "未分类"} · ${a.feed}] ${a.title}${useful(a.summary) ? ` —— ${cut(String(a.summary), 140)}` : ""}`).join("\n");
  return { text, count: rows.length };
}

// ---------- 提示词 ----------
const FORMAT = `输出格式要求：
- 用简体中文。
- 分成几个小节，每个小节的标题单独一行，以"## "开头。
- 要点用以"- "开头的列表，其余用普通段落。
- 除了"## "和"- "以外不要用任何 Markdown 记号（不要加粗、不要表格、不要代码块）。
- 直接写总结正文，不要开场白和结束语。`;

const LENGTH: Record<Period, string> = { day: "200 到 350 字", week: "350 到 600 字", month: "500 到 900 字" };

function personalPrompt(period: Period) {
  return `你是用户的个人助理。下面是用户在自己的个人管理网站上${PERIOD_NAME[period]}记下的内容（工作任务、收支、随记、生活清单，有的类别可能没有）。请写一份${PERIOD_NAME[period]}的总结。

要求：
- 只根据给出的记录来写，不要编造没有的事情和数字；没有记录的类别直接略过，不要写"没有记录"。
- 先用一小节概括这段时间的整体情况，再分领域说做了什么、进展如何，最后一小节给两三条具体、可执行的建议（比如哪些逾期的事该先处理、哪类支出偏高）。
- 语气平实、像朋友提醒，不要空话和鸡汤。称呼用户为"你"。
- 篇幅 ${LENGTH[period]}。

${FORMAT}`;
}

function newsPrompt(period: Period) {
  return `你是一位科技新闻编辑。下面是用户订阅的新闻来源${PERIOD_NAME[period]}发布的文章（每行一篇：[主题 · 来源] 标题 —— 摘要，有中文也有英文）。请写一份${PERIOD_NAME[period]}的中文简报。

要求：
- 挑出最值得关注的事情，把讲同一件事的文章合并成一条；按主题分小节（比如 AI、科技、开发），每节 3 到 6 条要点。
- 每条要点用一两句话讲清楚发生了什么、为什么值得关注，并在句末用括号注明来源名称。英文内容用中文转述。
- 只根据给出的标题和摘要来写，不要补充列表里没有的细节。
- 最后加一小节"一句话"，用一句话概括这段时间的主线。
- 篇幅 ${LENGTH[period]}。

${FORMAT}`;
}

// ---------- 接口 ----------
const query = z.object({ kind: z.enum(["personal", "news"]), period: z.enum(["day", "week", "month"]) });

const stored = (uid: number, kind: Kind, period: Period, start: string) =>
  db.prepare("SELECT content, model, start_date AS start, end_date AS end, created_at AS createdAt FROM summaries WHERE user_id = ? AND kind = ? AND period = ? AND start_date = ?").get(uid, kind, period, start) ?? null;

const busy = new Set<string>(); // 正在生成的（账号 + 种类 + 时间段），防止连点

export const summaryRouter = Router();

// GET /summary?kind=personal&period=week → 这个时间段已经生成过的总结（没有则 summary 为 null），以及模型配好了没有
summaryRouter.get("/", (req, res) => {
  const { kind, period } = query.parse(req.query);
  const range = rangeOf(period);
  res.json({ ...aiStatus(), range: { start: range.start, end: range.end }, summary: stored(req.userId!, kind, period, range.start) });
});

// POST /summary { kind, period } → 现在生成（或重新生成）一份。流式返回（见 aiStream.ts）：边写边发，写完存下来，
// 最后一行带上存好的那一份。中途关掉窗口就停下、不保存
summaryRouter.post("/", async (req, res) => {
  const { kind, period } = query.parse(req.body);
  const uid = req.userId!;
  if (!aiStatus().configured) return void res.status(400).json({ error: "还没有配置 AI 模型。在项目根目录的 .env 文件里填好 AI_BASE_URL、AI_API_KEY、AI_MODEL，然后重启网站。" });

  const range = rangeOf(period);
  let system: string;
  let material: string;
  if (kind === "personal") {
    const text = personalMaterial(uid, range.start, range.end);
    if (!text) return void res.status(400).json({ error: `${PERIOD_NAME[period]}还没有任何记录，没有可以总结的内容。` });
    system = personalPrompt(period);
    material = `时间范围：${range.start} 至 ${range.end}（${PERIOD_NAME[period]}，共 ${range.days} 天）\n\n${text}`;
  } else {
    const news = newsMaterial(uid, range.start);
    if (!news) return void res.status(400).json({ error: `「资讯」里没有${PERIOD_NAME[period]}发布的文章。先去资讯页刷新一次。` });
    system = newsPrompt(period);
    material = `时间范围：${range.start} 至 ${range.end}（${PERIOD_NAME[period]}），共 ${news.count} 篇文章：\n\n${news.text}`;
  }

  const key = `${uid}:${kind}:${period}`;
  if (busy.has(key)) return void res.status(409).json({ error: "这一份正在生成，稍等一下。" });
  busy.add(key);
  try {
    await streamReply(req, res, async (onText, signal) => {
      const { text, model } = await chatStream(system, [{ role: "user", content: material }], 0.5, onText, signal);
      db.prepare(
        `INSERT INTO summaries (user_id, kind, period, start_date, end_date, content, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)
         ON CONFLICT (user_id, kind, period, start_date) DO UPDATE SET end_date = excluded.end_date, content = excluded.content, model = excluded.model, created_at = excluded.created_at`,
      ).run(uid, kind, period, range.start, range.end, text.slice(0, 20_000), model, new Date().toISOString());
      return { summary: stored(uid, kind, period, range.start) };
    });
  } finally {
    busy.delete(key);
  }
});
