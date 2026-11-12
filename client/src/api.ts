export class ApiError extends Error {
  constructor(public status: number, message: string) {
    super(message);
  }
}

async function request<T>(method: string, url: string, body?: unknown): Promise<T> {
  const res = await fetch("/api" + url, {
    method,
    credentials: "include",
    headers: body !== undefined ? { "Content-Type": "application/json" } : undefined,
    body: body !== undefined ? JSON.stringify(body) : undefined,
  });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `请求失败 (${res.status})`);
  return data as T;
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: (url: string) => request<{ ok: true }>("DELETE", url),
};

// ---------- 类型 ----------
export type User = { id: number; username: string; avatar: string | null };

export type TaskStatus = "todo" | "doing" | "done";
export type Priority = "low" | "medium" | "high";
export type Task = {
  id: number;
  title: string;
  description: string;
  status: TaskStatus;
  priority: Priority;
  due_date: string | null;
  updated_at: string;
};

export type LifeItem = { id: number; title: string; category: string; done: boolean; date: string | null };

export type Expense = {
  id: number;
  type: "income" | "expense";
  amount: number;
  category: string;
  note: string;
  date: string;
};

export type Journal = {
  id: number;
  title: string;
  content: string;
  mood: string;
  tags: string;
  date: string;
};

export type Stats = {
  tasks: { todo: number; doing: number; done: number; overdue: number };
  life: { pending: number; today: number };
  money: { income: number; expense: number };
  doingTasks: Pick<Task, "id" | "title" | "priority" | "due_date">[];
  recentJournals: Pick<Journal, "id" | "title" | "mood" | "date">[];
  journalCount: number;
  learning: { weekMinutes: number; active: number };
  todayHabits: (Pick<Habit, "id" | "name" | "icon" | "color"> & { checked: boolean })[];
  today: string;
};

export type FavoriteKind = "link" | "text" | "image";
export type Favorite = {
  id: number;
  kind: FavoriteKind;
  title: string;
  /** link：网址本身；text / image：出处，可以为空 */
  url: string;
  /** text：摘录的正文；link / image：备注 */
  content: string;
  /** 分组名，空字符串表示未分组 */
  group: string;
  tags: string;
  pinned: boolean;
  /** 图片的读取地址，只有 image 有 */
  image: string | null;
  created_at: string;
};

export type LearningKind = "book" | "course" | "skill" | "other";
export type LearningStatus = "planned" | "active" | "paused" | "done";
export type LearningItem = {
  id: number;
  title: string;
  kind: LearningKind;
  status: LearningStatus;
  goal: string;
  progress: number;
  total: number | null;
  unit: string;
  target_date: string | null;
  total_minutes: number;
  last_date: string | null;
};
export type LearningLog = { id: number; item_id: number; date: string; minutes: number; content: string };

export type HabitColor = "emerald" | "sky" | "indigo" | "amber" | "rose" | "violet";
export type Habit = { id: number; name: string; icon: string; color: HabitColor; archived: boolean };
export type HabitCheck = { habit_id: number; date: string };

// ---------- 日期与时长工具 ----------
export const today = () => new Date().toLocaleDateString("sv");

/** 在 YYYY-MM-DD 上加减天数（用本地时间正午计算，避免夏令时误差） */
export function addDays(date: string, n: number) {
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d + n, 12).toLocaleDateString("sv");
}

/** 周一为一周的第一天，返回 0-6 */
export const weekdayIndex = (date: string) => (new Date(date + "T12:00:00").getDay() + 6) % 7;

export function fmtMinutes(min: number) {
  if (min < 60) return `${min} 分钟`;
  const h = Math.floor(min / 60);
  const m = min % 60;
  return m ? `${h} 小时 ${m} 分` : `${h} 小时`;
}

// ---------- 音乐 ----------
export type Track = {
  id: number;
  title: string;
  artist: string;
  source: "file" | "url";
  size: number | null;
  /** 播放地址：上传的文件是 /api/music/:id/file，链接就是原网址 */
  src: string;
  lyrics: string;
  created_at: string;
};

/** 上传文件用 multipart/form-data，不能走上面的 JSON 封装 */
export async function uploadFile<T>(url: string, form: FormData): Promise<T> {
  const res = await fetch("/api" + url, { method: "POST", credentials: "include", body: form });
  const data = await res.json().catch(() => ({}));
  if (!res.ok) throw new ApiError(res.status, data.error ?? `上传失败 (${res.status})`);
  return data as T;
}
