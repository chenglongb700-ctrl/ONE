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

/**
 * 流式 POST：AI 边写边回的接口用（服务器那边见 server/src/aiStream.ts）。
 * 响应是一行一个 JSON：{"t":"一截文字"} … 最后一行 {"done":true, …} 或者 {"error":"…"}。
 * 每收到一截就用 onText 递出"到目前为止的全部文字"；写完后返回最后那一行（去掉 done）。
 * signal 一触发（比如关掉了窗口），连接就断开，服务器那边的模型请求也跟着停。
 */
async function stream<T>(url: string, body: unknown, onText: (textSoFar: string) => void, signal?: AbortSignal): Promise<T> {
  const res = await fetch("/api" + url, {
    method: "POST",
    credentials: "include",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    // 参数不对、没配模型、正在忙这些，服务器还是按普通 JSON 返回错误
    const data = await res.json().catch(() => ({}));
    throw new ApiError(res.status, data.error ?? `请求失败 (${res.status})`);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let text = "";
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let nl: number;
    while ((nl = buffer.indexOf("\n")) >= 0) {
      const line = buffer.slice(0, nl).trim();
      buffer = buffer.slice(nl + 1);
      if (!line) continue;
      const msg = JSON.parse(line) as { t?: string; done?: boolean; error?: string } & Record<string, unknown>;
      if (typeof msg.t === "string") {
        text += msg.t;
        onText(text);
      } else if (msg.error) {
        throw new ApiError(502, msg.error);
      } else if (msg.done) {
        const { done: _done, ...rest } = msg;
        return rest as T;
      }
    }
  }
  throw new ApiError(502, "和服务器的连接断了，回答没写完，再试一次");
}

export const api = {
  get: <T>(url: string) => request<T>("GET", url),
  post: <T>(url: string, body?: unknown) => request<T>("POST", url, body ?? {}),
  put: <T>(url: string, body: unknown) => request<T>("PUT", url, body),
  del: (url: string) => request<{ ok: true }>("DELETE", url),
  stream,
};

/** 是不是"自己取消的"（关窗口时中断了流式请求）：这种不用报错 */
export const isAbort = (err: unknown) => (err as Error)?.name === "AbortError";

// ---------- 类型 ----------
export type User = { id: number; username: string; avatar: string | null; wallpaper: string | null };

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
  today: string;
};

/** 「热门」榜单上的一个 GitHub 项目 */
export type TrendingRepo = {
  /** 在当天榜单里的名次，从 1 开始 */
  rank: number;
  /** owner/repo */
  fullName: string;
  description: string;
  /** AI 翻的中文简介；还没翻或者本来就是中文时为空字符串 */
  descriptionZh: string;
  /** 主要的编程语言，可能为空 */
  language: string;
  stars: number;
  forks: number;
  /** 今天新增的星标数，榜单按它排 */
  starsToday: number;
  /** 领域分类（AI、前端、开发工具…），服务器按关键词判断的 */
  category: string;
  /** 上一份榜单里没有它 */
  isNew: boolean;
};

/** 「资讯」里的一篇文章 */
export type Article = {
  id: number;
  title: string;
  url: string;
  /** 纯文字摘要，可能为空 */
  summary: string;
  /** AI 翻的中文标题；还没翻或者本来就是中文时为空字符串 */
  titleZh: string;
  /** AI 写的中文摘要；还没写时为空字符串 */
  aiSummary: string;
  /** 发布时间，ISO 格式（UTC） */
  publishedAt: string;
  read: boolean;
  feedId: number;
  /** 来源的名字 */
  feed: string;
  /** 来源所属的主题，空字符串表示未分类 */
  topic: string;
};

/** 「资讯」订阅的一个新闻来源 */
export type Feed = {
  id: number;
  title: string;
  /** RSS 订阅地址 */
  url: string;
  siteUrl: string;
  topic: string;
  enabled: boolean;
  builtin: boolean;
  /** 上次去读的时间；null 表示还没读过 */
  lastFetchedAt: string | null;
  /** 上次读取失败的原因；成功为空字符串 */
  lastError: string;
  /** 已经读回来多少篇文章 */
  articles: number;
};

/** 右上角的倒计时 */
export type Countdown = {
  id: number;
  title: string;
  /** 目标日期 YYYY-MM-DD */
  date: string;
  /** 目标时刻 HH:MM；空字符串表示只精确到天 */
  time: string;
  /** 固定显示在右上角（最多一个） */
  pinned: boolean;
};

/** 「网址」里的一个常用网站 */
export type Site = {
  id: number;
  title: string;
  url: string;
  /** 分类名，空字符串表示未分类 */
  category: string;
  pinned: boolean;
  /** logo 的读取地址；没取到图标时为 null，界面上用名称的第一个字代替 */
  icon: string | null;
};

/** 一条斜杠命令。内置的来自服务器上的清单，也可以自己添加 */
export type Command = {
  id: number;
  /** 命令本身，带开头的斜杠，例如 /compact */
  name: string;
  /** 参数写法，例如 [可选] <必填> */
  args: string;
  aliases: string;
  category: string;
  description: string;
  example: string;
  /** 自己写的备注 */
  note: string;
  /** 常用 */
  pinned: boolean;
  builtin: boolean;
};

/** 收藏的种类。普通网址不在这里，统一放在「网址」页面（见 Site） */
export type FavoriteKind = "text" | "image" | "video";
export type Favorite = {
  id: number;
  kind: FavoriteKind;
  title: string;
  /** 出处的网址，可以为空；视频链接的话，这就是视频所在的网页 */
  url: string;
  /** text：摘录的正文；image / video：备注 */
  content: string;
  /** 分组名，空字符串表示未分组 */
  group: string;
  tags: string;
  pinned: boolean;
  /** 图片的读取地址，只有 image 有 */
  image: string | null;
  /** 上传的视频文件的读取地址；视频链接没有文件，为 null */
  video: string | null;
  /** 视频链接的封面图地址，没取到时为 null */
  cover: string | null;
  /** 来自哪个平台（按出处网址认出来的，比如 B站）；自己上传的文件是「本地」；认不出为空字符串 */
  platform: string;
  created_at: string;
};

// ---------- 日期与时长工具 ----------
export const today = () => new Date().toLocaleDateString("sv");

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

// ---------- 健身 ----------
export type BodyLog = { id: number; date: string; weight: number; waist: number | null; body_fat: number | null; note: string };
export type Meal = "breakfast" | "lunch" | "dinner" | "snack";
export type FoodLog = { id: number; date: string; meal: Meal; name: string; amount: string; kcal: number };
export type Workout = { id: number; date: string; type: string; minutes: number; kcal: number; note: string };
export type StrengthLog = { id: number; date: string; exercise: string; weight: number; reps: number; sets: number };
