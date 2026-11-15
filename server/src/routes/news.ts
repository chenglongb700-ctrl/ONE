import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { FEED_SEED } from "../feedSeed.js";
import { FeedError, fetchFeed, resolveFeed, type ParsedFeed } from "../feeds.js";

/**
 * 资讯：订阅一批新闻来源（RSS），把它们的最新文章读回来，按主题看。
 * 不在后台定时抓取：打开页面时前端调一次 POST /news/refresh，超过半小时没读过的来源才会重新读。
 * 以后接 AI（每日简报、问答）时，直接拿 articles 表里的文章当材料。
 */
const STALE_MS = 30 * 60 * 1000; // 一个来源多久没读算"过期"
const PAGE_SIZE = 40;
const KEEP_DAYS = 30; // 文章保留多少天
const KEEP_MIN = 50; // 每个来源至少留这么多篇（更新慢的博客，一年前的文章也可能是它最新的几篇）
const CONCURRENCY = 4; // 同时去读几个来源

type FeedRow = {
  id: number;
  user_id: number;
  title: string;
  url: string;
  site_url: string;
  topic: string;
  enabled: number;
  builtin: number;
  last_fetched_at: string | null;
  last_error: string;
};

const feedToClient = (f: FeedRow & { articles?: number }) => ({
  id: f.id,
  title: f.title,
  url: f.url,
  siteUrl: f.site_url,
  topic: f.topic,
  enabled: f.enabled === 1,
  builtin: f.builtin === 1,
  lastFetchedAt: f.last_fetched_at,
  lastError: f.last_error,
  articles: f.articles ?? 0,
});

const getFeed = (id: number, uid: number) => db.prepare("SELECT * FROM feeds WHERE id = ? AND user_id = ?").get(id, uid) as FeedRow | undefined;
const idSchema = z.coerce.number().int().positive();

// ---------- 内置来源 ----------
const insertBuiltin = db.prepare(
  `INSERT INTO feeds (user_id, title, url, site_url, topic, builtin)
   SELECT ?, ?, ?, ?, ?, 1 WHERE NOT EXISTS (SELECT 1 FROM feeds WHERE user_id = ? AND url = ?)`,
);

function addBuiltins(uid: number): number {
  let added = 0;
  for (const f of FEED_SEED) added += Number(insertBuiltin.run(uid, f.title, f.url, f.siteUrl, f.topic, uid, f.url).changes);
  return added;
}

/** 每个账号只自动加一次内置来源：这样用户删掉的来源不会在下次打开时又冒出来 */
function seedOnce(uid: number) {
  const u = db.prepare("SELECT feeds_seeded FROM users WHERE id = ?").get(uid) as { feeds_seeded: number } | undefined;
  if (!u || u.feeds_seeded) return;
  addBuiltins(uid);
  db.prepare("UPDATE users SET feeds_seeded = 1 WHERE id = ?").run(uid);
}

// ---------- 把读回来的文章存进数据库 ----------
const insertArticle = db.prepare(
  "INSERT OR IGNORE INTO articles (user_id, feed_id, guid, title, url, summary, published_at) VALUES (?, ?, ?, ?, ?, ?, ?)", // 已经有的（UNIQUE 冲突）直接跳过
);

/** 存下一个来源刚读回来的文章，返回新增了几篇。同时清掉太旧的 */
function saveArticles(feed: FeedRow, parsed: ParsedFeed): number {
  const now = new Date().toISOString();
  let added = 0;
  db.exec("BEGIN");
  try {
    // 来源没写时间（或者写错了）的文章，当作现在发布的
    for (const it of parsed.items) added += Number(insertArticle.run(feed.user_id, feed.id, it.guid, it.title, it.url, it.summary, it.publishedAt ?? now).changes);
    const cutoff = new Date(Date.now() - KEEP_DAYS * 86_400_000).toISOString();
    db.prepare(
      `DELETE FROM articles WHERE feed_id = ? AND published_at < ?
       AND id NOT IN (SELECT id FROM articles WHERE feed_id = ? ORDER BY published_at DESC LIMIT ?)`,
    ).run(feed.id, cutoff, feed.id, KEEP_MIN);
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
  return added;
}

const markFetched = db.prepare("UPDATE feeds SET last_fetched_at = ?, last_error = ? WHERE id = ?");

/** 去读一个来源并存下来。读不到不抛错：把原因记在这个来源上，返回 { error } */
async function refreshFeed(feed: FeedRow): Promise<{ added: number; error: string }> {
  const at = new Date().toISOString();
  try {
    const added = saveArticles(feed, await fetchFeed(feed.url));
    markFetched.run(at, "", feed.id);
    return { added, error: "" };
  } catch (err) {
    const error = err instanceof FeedError ? err.message : "读取时出错了";
    if (!(err instanceof FeedError)) console.error(err);
    markFetched.run(at, error, feed.id); // 失败也记下时间：半小时内不再反复去敲一个打不开的网站
    return { added: 0, error };
  }
}

const refreshing = new Set<number>(); // 正在刷新的账号：同一个账号同时只跑一次

export const newsRouter = Router();

// ---------- 文章 ----------
// GET /news?topic=AI&unread=1&q=关键词&offset=40
newsRouter.get("/", (req, res) => {
  const uid = req.userId!;
  seedOnce(uid);
  const q = z
    .object({
      topic: z.string().max(20).optional(),
      unread: z.string().optional(),
      q: z.string().trim().max(100).optional(),
      offset: z.coerce.number().int().min(0).default(0),
    })
    .parse(req.query);

  const where = ["a.user_id = ?", "f.enabled = 1"];
  const params: (string | number)[] = [uid];
  if (q.topic !== undefined) {
    where.push("f.topic = ?");
    params.push(q.topic);
  }
  if (q.unread === "1") where.push("a.read = 0");
  if (q.q) {
    // LIKE 里 % 和 _ 是通配符：用户搜的字里有这两个字符时，前面加反斜杠表示"就是这个字符本身"
    const like = `%${q.q.replace(/[\\%_]/g, "\\$&")}%`;
    where.push("(a.title LIKE ? ESCAPE '\\' OR a.summary LIKE ? ESCAPE '\\')");
    params.push(like, like);
  }
  const rows = db
    .prepare(
      `SELECT a.id, a.title, a.url, a.summary, a.published_at AS publishedAt, a.read, f.id AS feedId, f.title AS feed, f.topic
       FROM articles a JOIN feeds f ON f.id = a.feed_id
       WHERE ${where.join(" AND ")}
       ORDER BY a.published_at DESC, a.id DESC LIMIT ? OFFSET ?`,
    )
    .all(...params, PAGE_SIZE + 1, q.offset) as { read: number }[]; // 多取一条，用来判断后面还有没有

  // 每个主题有多少篇未读，给顶部的筛选标签用
  const unread = db
    .prepare("SELECT f.topic, COUNT(*) AS n FROM articles a JOIN feeds f ON f.id = a.feed_id WHERE a.user_id = ? AND f.enabled = 1 AND a.read = 0 GROUP BY f.topic")
    .all(uid) as { topic: string; n: number }[];

  res.json({
    items: rows.slice(0, PAGE_SIZE).map((r) => ({ ...r, read: r.read === 1 })),
    hasMore: rows.length > PAGE_SIZE,
    unread: Object.fromEntries(unread.map((u) => [u.topic, u.n])),
  });
});

// 重新读取来源。默认只读过期的；{ force: true } 时全部重读（手动点"刷新"）
newsRouter.post("/refresh", async (req, res) => {
  const uid = req.userId!;
  seedOnce(uid);
  const { force } = z.object({ force: z.boolean().default(false) }).parse(req.body ?? {});
  if (refreshing.has(uid)) return void res.json({ busy: true, checked: 0, added: 0, failed: [] });

  const staleBefore = new Date(Date.now() - STALE_MS).toISOString();
  const due = (db.prepare("SELECT * FROM feeds WHERE user_id = ? AND enabled = 1").all(uid) as FeedRow[]).filter(
    (f) => force || !f.last_fetched_at || f.last_fetched_at < staleBefore,
  );

  refreshing.add(uid);
  try {
    let added = 0;
    const failed: { title: string; error: string }[] = [];
    // 几个"工人"一起从队列里领来源去读：既不会一口气发出十几个请求，也不用一个一个排队等
    const queue = [...due];
    const worker = async () => {
      for (let feed = queue.shift(); feed; feed = queue.shift()) {
        const r = await refreshFeed(feed);
        added += r.added;
        if (r.error) failed.push({ title: feed.title, error: r.error });
      }
    };
    await Promise.all(Array.from({ length: CONCURRENCY }, worker));
    res.json({ busy: false, checked: due.length, added, failed });
  } finally {
    refreshing.delete(uid);
  }
});

// 全部标为已读（可以只标某个主题的）
newsRouter.post("/read-all", (req, res) => {
  const { topic } = z.object({ topic: z.string().max(20).optional() }).parse(req.body ?? {});
  const r =
    topic === undefined
      ? db.prepare("UPDATE articles SET read = 1 WHERE user_id = ? AND read = 0").run(req.userId!)
      : db.prepare("UPDATE articles SET read = 1 WHERE user_id = ? AND read = 0 AND feed_id IN (SELECT id FROM feeds WHERE user_id = ? AND topic = ?)").run(req.userId!, req.userId!, topic);
  res.json({ changed: Number(r.changes) });
});

// ---------- 来源（这几条要写在 /:id 前面，不然 "feeds" 会被当成文章的 id） ----------
newsRouter.get("/feeds", (req, res) => {
  seedOnce(req.userId!);
  const rows = db
    .prepare("SELECT f.*, (SELECT COUNT(*) FROM articles a WHERE a.feed_id = f.id) AS articles FROM feeds f WHERE f.user_id = ? ORDER BY f.id")
    .all(req.userId!) as (FeedRow & { articles: number })[];
  res.json(rows.map(feedToClient));
});

const feedUrl = z
  .string()
  .trim()
  .max(2000)
  .url("请输入完整的地址，以 http:// 或 https:// 开头")
  .refine((u) => /^https?:\/\//i.test(u), "只支持 http 或 https 地址");

// 添加来源：填订阅地址或者网站地址都行。会当场去读一次，读得到才加进来
newsRouter.post("/feeds", async (req, res) => {
  const d = z.object({ url: feedUrl, title: z.string().trim().max(40).default(""), topic: z.string().trim().max(20).default("") }).parse(req.body);
  const uid = req.userId!;
  let found: Awaited<ReturnType<typeof resolveFeed>>;
  try {
    found = await resolveFeed(d.url);
  } catch (err) {
    if (err instanceof FeedError) return void res.status(400).json({ error: err.message });
    throw err;
  }
  if (db.prepare("SELECT 1 FROM feeds WHERE user_id = ? AND url = ?").get(uid, found.url)) return void res.status(400).json({ error: "这个来源已经添加过了" });
  const title = d.title || found.feed.title.slice(0, 40) || new URL(found.url).hostname.replace(/^www\./, "");
  const r = db.prepare("INSERT INTO feeds (user_id, title, url, site_url, topic, last_fetched_at) VALUES (?, ?, ?, ?, ?, ?)").run(uid, title, found.url, found.feed.siteUrl, d.topic, new Date().toISOString());
  const feed = getFeed(Number(r.lastInsertRowid), uid)!;
  const articles = saveArticles(feed, found.feed); // 刚才已经读回来了，直接存，不用再读一遍
  res.status(201).json(feedToClient({ ...feed, articles }));
});

// 把删掉的内置来源补回来
newsRouter.post("/feeds/restore", (req, res) => {
  res.json({ added: addBuiltins(req.userId!) });
});

// 改名、换主题、停用 / 启用（可以只传要改的字段）
newsRouter.put("/feeds/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const old = getFeed(id, req.userId!);
  if (!old) return void res.status(404).json({ error: "这个来源不存在" });
  const d = z
    .object({ title: z.string().trim().min(1, "名称不能为空").max(40), topic: z.string().trim().max(20), enabled: z.boolean() })
    .partial()
    .parse(req.body);
  db.prepare("UPDATE feeds SET title = ?, topic = ?, enabled = ? WHERE id = ? AND user_id = ?").run(
    d.title ?? old.title,
    d.topic ?? old.topic,
    d.enabled === undefined ? old.enabled : d.enabled ? 1 : 0,
    id,
    req.userId!,
  );
  res.json(feedToClient(getFeed(id, req.userId!)!));
});

// 删除来源，它的文章跟着一起删（表上的 ON DELETE CASCADE）
newsRouter.delete("/feeds/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const r = db.prepare("DELETE FROM feeds WHERE id = ? AND user_id = ?").run(id, req.userId!);
  if (!r.changes) return void res.status(404).json({ error: "这个来源不存在" });
  res.json({ ok: true });
});

// ---------- 单篇文章：标为已读 / 未读 ----------
newsRouter.put("/:id", (req, res) => {
  const id = idSchema.parse(req.params.id);
  const { read } = z.object({ read: z.boolean() }).parse(req.body);
  const r = db.prepare("UPDATE articles SET read = ? WHERE id = ? AND user_id = ?").run(read ? 1 : 0, id, req.userId!);
  if (!r.changes) return void res.status(404).json({ error: "这篇文章不存在" });
  res.json({ ok: true });
});
