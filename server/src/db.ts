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

// 收藏夹：kind = link（网址）/ text（摘录）/ image（图片，文件在 data/favorites/）
db.exec(`
CREATE TABLE IF NOT EXISTS favorites (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id INTEGER NOT NULL REFERENCES users(id) ON DELETE CASCADE,
  kind TEXT NOT NULL CHECK (kind IN ('link','text','image')),
  title TEXT NOT NULL DEFAULT '',
  url TEXT NOT NULL DEFAULT '',
  content TEXT NOT NULL DEFAULT '',
  file_name TEXT,
  mime TEXT,
  grp TEXT NOT NULL DEFAULT '',
  tags TEXT NOT NULL DEFAULT '',
  pinned INTEGER NOT NULL DEFAULT 0,
  created_at TEXT NOT NULL DEFAULT (datetime('now','localtime'))
);
CREATE INDEX IF NOT EXISTS idx_fav_user ON favorites(user_id, pinned, id);
`);

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
