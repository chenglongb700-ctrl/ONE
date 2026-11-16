import { DatabaseSync } from "node:sqlite";
import { mkdirSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dbPath = process.env.DB_PATH ?? resolve(here, "../data/app.db");
mkdirSync(dirname(dbPath), { recursive: true });

export const db = new DatabaseSync(dbPath);
db.exec("PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;");

db.exec(`
CREATE TABLE IF NOT EXISTS users (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  username TEXT NOT NULL UNIQUE,
  password_hash TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS tasks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  description TEXT NOT NULL DEFAULT '',
  status TEXT NOT NULL DEFAULT 'todo' CHECK (status IN ('todo','doing','done')),
  priority TEXT NOT NULL DEFAULT 'medium' CHECK (priority IN ('low','medium','high')),
  due_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS life_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  done INTEGER NOT NULL DEFAULT 0,
  date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS expenses (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  type TEXT NOT NULL CHECK (type IN ('income','expense')),
  amount REAL NOT NULL,
  category TEXT NOT NULL DEFAULT '其他',
  note TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE TABLE IF NOT EXISTS journals (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  content TEXT NOT NULL DEFAULT '',
  mood TEXT NOT NULL DEFAULT '😊',
  tags TEXT NOT NULL DEFAULT '',
  date TEXT NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 学习项目：一本书、一门课、一项技能
CREATE TABLE IF NOT EXISTS learning_items (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  kind TEXT NOT NULL DEFAULT 'book' CHECK (kind IN ('book','course','skill','other')),
  status TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('planned','active','paused','done')),
  goal TEXT NOT NULL DEFAULT '',
  progress REAL NOT NULL DEFAULT 0,
  total REAL,                -- 为空表示不按进度计（例如"学英语"）
  unit TEXT NOT NULL DEFAULT '章',
  target_date TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  updated_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 学习日志：一个学习项目对应多条日志（一对多）
CREATE TABLE IF NOT EXISTS learning_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  item_id INTEGER NOT NULL REFERENCES learning_items(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  minutes INTEGER NOT NULL DEFAULT 0,
  content TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 习惯
CREATE TABLE IF NOT EXISTS habits (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  icon TEXT NOT NULL DEFAULT '✅',
  color TEXT NOT NULL DEFAULT 'emerald',
  archived INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
-- 打卡记录：UNIQUE(habit_id, date) 保证同一习惯同一天只能打一次卡
CREATE TABLE IF NOT EXISTS habit_checks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  habit_id INTEGER NOT NULL REFERENCES habits(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  UNIQUE (habit_id, date)
);
CREATE INDEX IF NOT EXISTS idx_learning_user ON learning_items(user_id);
CREATE INDEX IF NOT EXISTS idx_llogs_item ON learning_logs(item_id, date);
CREATE INDEX IF NOT EXISTS idx_llogs_user ON learning_logs(user_id, date);
CREATE INDEX IF NOT EXISTS idx_habits_user ON habits(user_id);
CREATE INDEX IF NOT EXISTS idx_checks_user ON habit_checks(user_id, date);
CREATE INDEX IF NOT EXISTS idx_tasks_user ON tasks(user_id);

CREATE INDEX IF NOT EXISTS idx_life_user ON life_items(user_id);
CREATE INDEX IF NOT EXISTS idx_exp_user ON expenses(user_id, date);
CREATE INDEX IF NOT EXISTS idx_journal_user ON journals(user_id, date);
`);

// ---------- 迁移 ----------
// CREATE TABLE IF NOT EXISTS 不会修改已经存在的表。
// 表结构变化后，用 ALTER TABLE 给旧数据库补上缺少的列（只加列，不删数据）。
function ensureColumn(table: string, column: string, definition: string) {
  const cols = db.prepare(`PRAGMA table_info(${table})`).all() as { name: string }[];
  if (!cols.some((c) => c.name === column)) {
    db.exec(`ALTER TABLE ${table} ADD COLUMN ${column} ${definition}`);
    console.log(`[db] migrated: ${table}.${column}`);
  }
}

ensureColumn("habits", "color", "TEXT NOT NULL DEFAULT 'emerald'");
ensureColumn("users", "avatar", "TEXT"); // 头像文件名，文件在 data/avatars/
ensureColumn("users", "wallpaper", "TEXT"); // 自定义壁纸文件名，文件在 data/wallpapers/

// 收藏夹：kind = text（摘录）/ image（图片）/ video（视频：上传的文件，或者一个视频链接）
// file_name 是图片或视频文件，cover 是视频链接的封面图，文件都在 data/favorites/
const FAVORITES_TABLE = (name: string) => `
CREATE TABLE IF NOT EXISTS ${name} (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('text','image','video')),
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  mime TEXT,
  cover TEXT,
  grp TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);`;
db.exec(FAVORITES_TABLE("favorites"));

// 命令：Claude Code 斜杠命令速查表。builtin = 1 表示是从内置清单（commandSeed.ts）抄来的
db.exec(`
CREATE TABLE IF NOT EXISTS commands (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  args TEXT NOT NULL DEFAULT '',
  aliases TEXT NOT NULL DEFAULT '',
  category TEXT NOT NULL DEFAULT '',
  description TEXT NOT NULL DEFAULT '',
  example TEXT NOT NULL DEFAULT '',
  note TEXT NOT NULL DEFAULT '',     -- 自己写的备注
  pinned INTEGER NOT NULL DEFAULT 0, -- 常用
  builtin INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_commands_user ON commands(user_id, id);
`);
ensureColumn("users", "commands_seeded", "INTEGER NOT NULL DEFAULT 0"); // 这个账号是否已经抄过一次内置命令清单

// 网址：常用网站的导航页。icon 是取回来的 logo 文件名，文件在 data/site-icons/
db.exec(`
CREATE TABLE IF NOT EXISTS sites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL,
  category TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  icon TEXT,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_sites_user ON sites(user_id, pinned, id);
`);

// 迁移：收藏夹以前也能收网址（kind = 'link'），现在网址统一放在 sites 里。
// 把旧的网址收藏搬过来（分组变成分类；已经有同一个网址的不重复搬），然后从收藏夹里删掉。
// logo 留空，在「网址」页面的编辑里点"重新获取图标"就有了。备注和标签在 sites 里没有对应的地方，不保留。
{
  const moved = db
    .prepare(
      `INSERT INTO sites (user_id, title, url, category, pinned)
       SELECT f.user_id, f.title, f.url, f.grp, f.pinned FROM favorites f
       WHERE f.kind = 'link' AND NOT EXISTS (SELECT 1 FROM sites s WHERE s.user_id = f.user_id AND s.url = f.url)`,
    )
    .run().changes;
  const removed = db.prepare("DELETE FROM favorites WHERE kind = 'link'").run().changes;
  if (removed) console.log(`[db] migrated: ${removed} link favourites -> sites (${moved} added)`);
}

// 迁移：老数据库里 favorites 表的 kind 只允许 link / text / image，不认识后来加的 video。
// SQLite 改不了已有的约束，只能照新结构建一张表，把数据倒过去，再换掉旧表（放在一个事务里，失败就原样退回）。
{
  const old = db.prepare("SELECT sql FROM sqlite_master WHERE type = 'table' AND name = 'favorites'").get() as { sql: string };
  if (!old.sql.includes("'video'")) {
    db.exec("BEGIN");
    try {
      db.exec(FAVORITES_TABLE("favorites_new"));
      db.exec(`
        INSERT INTO favorites_new (id, user_id, kind, title, url, content, file_name, mime, grp, tags, pinned, created_at)
          SELECT id, user_id, kind, title, url, content, file_name, mime, grp, tags, pinned, created_at FROM favorites;
        DROP TABLE favorites;
        ALTER TABLE favorites_new RENAME TO favorites;
      `);
      db.exec("COMMIT");
      console.log("[db] migrated: favorites table rebuilt (kind now allows video)");
    } catch (err) {
      db.exec("ROLLBACK");
      throw err;
    }
  }
}
db.exec("CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id, pinned, id)");

// 倒计时：date 是 YYYY-MM-DD，time 是 HH:MM 或空字符串（只精确到天）；pinned = 固定显示在右上角
db.exec(`
CREATE TABLE IF NOT EXISTS countdowns (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  date TEXT NOT NULL,
  time TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_countdowns_user ON countdowns(user_id, date);
`);

// 资讯：feeds 是订阅的新闻来源（RSS 地址），articles 是从这些来源读回来的文章。
// UNIQUE (feed_id, guid) 保证同一篇文章不会存两遍；删掉来源时它的文章跟着删（ON DELETE CASCADE）。
// 时间都存成 ISO 格式的 UTC 时间（2026-11-15T03:00:00.000Z），这种写法按字符串排序就是按时间排序。
db.exec(`
CREATE TABLE IF NOT EXISTS feeds (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  url TEXT NOT NULL,                  -- RSS / Atom 地址
  site_url TEXT NOT NULL DEFAULT '',  -- 网站首页
  topic TEXT NOT NULL DEFAULT '',     -- 主题，空字符串 = 未分类
  enabled INTEGER NOT NULL DEFAULT 1,
  builtin INTEGER NOT NULL DEFAULT 0, -- 是不是从内置清单（feedSeed.ts）来的
  last_fetched_at TEXT,               -- 上次去读的时间，NULL = 还没读过
  last_error TEXT NOT NULL DEFAULT '',-- 上次读取失败的原因，成功则为空
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_feeds_user ON feeds(user_id);
CREATE TABLE IF NOT EXISTS articles (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  feed_id INTEGER NOT NULL REFERENCES feeds(id) ON DELETE CASCADE,
  guid TEXT NOT NULL,                 -- 来源给每篇文章的唯一标识
  title TEXT NOT NULL,
  url TEXT NOT NULL,
  summary TEXT NOT NULL DEFAULT '',   -- 纯文字摘要（已经去掉 HTML 标签）
  published_at TEXT NOT NULL,
  read INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime')),
  UNIQUE (feed_id, guid)
);
CREATE INDEX IF NOT EXISTS idx_articles_user ON articles(user_id, published_at DESC);

-- AI 总结：每个账号、每种内容（自己的记录 / 资讯）、每个时间段（某一天 / 某一周 / 某个月）存一份，重新生成就覆盖
CREATE TABLE IF NOT EXISTS summaries (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('personal','news')),
  period TEXT NOT NULL CHECK (period IN ('day','week','month')),
  start_date TEXT NOT NULL,           -- 这段时间的第一天 YYYY-MM-DD
  end_date TEXT NOT NULL,             -- 生成时的最后一天（就是生成那天）
  content TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',     -- 是哪个模型写的
  created_at TEXT NOT NULL,           -- 生成时间，ISO 格式
  UNIQUE (user_id, kind, period, start_date)
);

-- ---------- 健身（减脂）----------
-- 个人资料：算基础代谢和建议摄入用，每个账号一行
CREATE TABLE IF NOT EXISTS fitness_profile (
  user_id INTEGER PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
  sex TEXT NOT NULL CHECK (sex IN ('male','female')),
  birth_year INTEGER NOT NULL,
  height_cm REAL NOT NULL,
  activity TEXT NOT NULL CHECK (activity IN ('sedentary','light','moderate','active')),
  target_weight REAL NOT NULL,        -- 目标体重 kg
  weekly_loss REAL NOT NULL           -- 每周想减多少 kg
);
-- 体重和围度：一天最多一条
CREATE TABLE IF NOT EXISTS body_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  weight REAL NOT NULL,               -- kg
  waist REAL,                         -- 腰围 cm，可以不记
  body_fat REAL,                      -- 体脂率 %，可以不记
  note TEXT NOT NULL DEFAULT '',
  UNIQUE (user_id, date)
);
-- 饮食：吃的每样东西一条
CREATE TABLE IF NOT EXISTS food_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  meal TEXT NOT NULL CHECK (meal IN ('breakfast','lunch','dinner','snack')),
  name TEXT NOT NULL,
  amount TEXT NOT NULL DEFAULT '',    -- 分量的文字描述，例如"150 克""1 个"
  kcal REAL NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_food_user ON food_logs(user_id, date);
-- 运动：每次运动一条
CREATE TABLE IF NOT EXISTS workouts (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  type TEXT NOT NULL,                 -- 跑步、游泳…（文字）
  minutes INTEGER NOT NULL,
  kcal REAL NOT NULL DEFAULT 0,       -- 消耗的热量：前端按类型和体重估算，也可以手动填
  note TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_workouts_user ON workouts(user_id, date);
-- 力量训练：某天做的某个动作一条（重量 × 每组次数 × 组数）
CREATE TABLE IF NOT EXISTS strength_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  date TEXT NOT NULL,
  exercise TEXT NOT NULL,
  weight REAL NOT NULL DEFAULT 0,     -- kg；自重动作填 0
  reps INTEGER NOT NULL,
  sets INTEGER NOT NULL,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_strength_user ON strength_logs(user_id, exercise, date);
-- AI 点评：看的是最近 7 天；按这 7 天的起始日期存，同一天重新生成就覆盖
CREATE TABLE IF NOT EXISTS fitness_reviews (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  start_date TEXT NOT NULL,
  end_date TEXT NOT NULL,
  content TEXT NOT NULL,
  model TEXT NOT NULL DEFAULT '',
  created_at TEXT NOT NULL,
  UNIQUE (user_id, start_date)
);
`);
ensureColumn("users", "feeds_seeded", "INTEGER NOT NULL DEFAULT 0"); // 这个账号是否已经加过一次内置的新闻来源

// GitHub 热门：每天存一份榜单快照。这两张表没有 user_id——榜单对所有账号都一样，不用每人存一份。
// trending_days 记每一天的榜单是什么时候读回来的；trending 是那一天榜单上的项目。
db.exec(`
CREATE TABLE IF NOT EXISTS trending_days (
  date TEXT PRIMARY KEY,              -- YYYY-MM-DD（服务器所在地的日期）
  fetched_at TEXT NOT NULL,           -- ISO 格式
  failed_pages INTEGER NOT NULL DEFAULT 0
);
CREATE TABLE IF NOT EXISTS trending (
  date TEXT NOT NULL REFERENCES trending_days(date) ON DELETE CASCADE,
  rank INTEGER NOT NULL,
  full_name TEXT NOT NULL,            -- owner/repo
  description TEXT NOT NULL DEFAULT '',
  language TEXT NOT NULL DEFAULT '',
  stars INTEGER NOT NULL DEFAULT 0,
  forks INTEGER NOT NULL DEFAULT 0,
  stars_today INTEGER NOT NULL DEFAULT 0,
  category TEXT NOT NULL DEFAULT '',
  PRIMARY KEY (date, full_name)
);
`);

// 音乐：source = file（上传到 data/music/ 的文件）或 url（外部链接）
db.exec(`
CREATE TABLE IF NOT EXISTS tracks (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  title TEXT NOT NULL,
  artist TEXT NOT NULL DEFAULT '',
  source TEXT NOT NULL CHECK (source IN ('file','url')),
  file_name TEXT,            -- 服务器上的随机文件名（不使用用户给的文件名，防止路径注入）
  mime TEXT,
  size INTEGER,
  url TEXT,
  lyrics TEXT NOT NULL DEFAULT '',   -- LRC 格式歌词
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_tracks_user ON tracks(user_id);
`);

// AI 翻译和摘要的结果存在原来的表里，空字符串表示还没有
ensureColumn("articles", "title_zh", "TEXT NOT NULL DEFAULT ''"); // 标题的中文翻译
ensureColumn("articles", "ai_summary", "TEXT NOT NULL DEFAULT ''"); // AI 写的中文摘要
ensureColumn("trending", "description_zh", "TEXT NOT NULL DEFAULT ''"); // 项目简介的中文翻译
