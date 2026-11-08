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
};

export const today = () => new Date().toLocaleDateString("sv");
