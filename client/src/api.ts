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
export type User = { id: number; username: string };

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
