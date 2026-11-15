import { Router } from "express";
import { z } from "zod";
import { db } from "../db.js";
import { CATEGORY_NAMES, fetchTrending } from "../trending.js";

/**
 * GitHub 热门：每天一份"今天星标涨得最快的 50 个项目"的榜单，按领域分好类。
 * 和「资讯」一样不在后台定时抓：打开页面时，如果今天还没有榜单、或者榜单是 6 小时前的，前端会调一次 POST /trending/refresh。
 * 每天的榜单都存着（保留 30 天），可以回头看前几天的，也用来标出"今天新上榜"的项目。
 */
const STALE_MS = 6 * 60 * 60 * 1000;
const KEEP_DAYS = 30;

const today = () => new Date().toLocaleDateString("sv"); // sv（瑞典）的日期写法正好是 YYYY-MM-DD

type Day = { date: string; fetched_at: string; failed_pages: number };
const getDay = (date: string) => db.prepare("SELECT * FROM trending_days WHERE date = ?").get(date) as Day | undefined;
const isStale = () => {
  const d = getDay(today());
  return !d || Date.now() - Date.parse(d.fetched_at) > STALE_MS;
};

let running: Promise<void> | null = null; // 正在进行的那一次抓取：同时来几个请求时大家等同一次，不重复抓

async function refresh(): Promise<void> {
  const { repos, failed } = await fetchTrending();
  const date = today();
  db.exec("BEGIN");
  try {
    // 今天的榜单整份换掉（一天里多次刷新，后一次覆盖前一次）
    db.prepare("DELETE FROM trending_days WHERE date = ?").run(date); // trending 里这一天的项目跟着删（ON DELETE CASCADE）
    db.prepare("INSERT INTO trending_days (date, fetched_at, failed_pages) VALUES (?, ?, ?)").run(date, new Date().toISOString(), failed);
    const insert = db.prepare("INSERT INTO trending (date, rank, full_name, description, language, stars, forks, stars_today, category) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)");
    repos.forEach((r, i) => insert.run(date, i + 1, r.fullName, r.description, r.language, r.stars, r.forks, r.starsToday, r.category));
    db.prepare("DELETE FROM trending_days WHERE date < ?").run(new Date(Date.now() - KEEP_DAYS * 86_400_000).toLocaleDateString("sv"));
    db.exec("COMMIT");
  } catch (err) {
    db.exec("ROLLBACK");
    throw err;
  }
}

export const trendingRouter = Router();

// GET /trending?date=2026-11-15。不传 date 就给最新的一天
trendingRouter.get("/", (req, res) => {
  const { date: wanted } = z.object({ date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional() }).parse(req.query);
  const dates = (db.prepare("SELECT date FROM trending_days ORDER BY date DESC").all() as { date: string }[]).map((d) => d.date);
  const date = wanted && dates.includes(wanted) ? wanted : dates[0];
  const day = date ? getDay(date) : undefined;
  if (!day) return void res.json({ date: null, fetchedAt: null, failedPages: 0, items: [], dates, categories: CATEGORY_NAMES, stale: true });

  // 这一天之前最近的那份榜单：不在那上面的项目就是"新上榜"
  const prev = dates.find((d) => d < day.date);
  const before = new Set(prev ? (db.prepare("SELECT full_name FROM trending WHERE date = ?").all(prev) as { full_name: string }[]).map((r) => r.full_name) : []);
  const rows = db
    .prepare("SELECT rank, full_name AS fullName, description, language, stars, forks, stars_today AS starsToday, category FROM trending WHERE date = ? ORDER BY rank")
    .all(day.date) as { fullName: string }[];
  res.json({
    date: day.date,
    fetchedAt: day.fetched_at,
    failedPages: day.failed_pages,
    items: rows.map((r) => ({ ...r, isNew: !!prev && !before.has(r.fullName) })),
    dates,
    categories: CATEGORY_NAMES,
    stale: isStale(),
  });
});

// 去 GitHub 重新读一遍今天的榜单。默认只在今天还没有、或者已经过了 6 小时才读；{ force: true } 时一定读
trendingRouter.post("/refresh", async (req, res) => {
  const { force } = z.object({ force: z.boolean().default(false) }).parse(req.body ?? {});
  if (!force && !isStale() && !running) return void res.json({ refreshed: false });
  try {
    running ??= refresh().finally(() => {
      running = null;
    });
    await running;
    res.json({ refreshed: true });
  } catch (err) {
    res.status(502).json({ error: `没能读到 GitHub 的热门榜：${(err as Error).message}` });
  }
});
