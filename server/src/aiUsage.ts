import { AsyncLocalStorage } from "node:async_hooks";
import { db } from "./db.js";
import "./env.js";

/**
 * AI 用了多少 token、账户里还剩多少钱。
 *
 * 用量：每次调用模型，接口都会在返回里带上 usage（输入、输出各多少 token，其中多少命中了缓存），
 * 记进 ai_usage 表。记在谁头上：requireAuth 用 AsyncLocalStorage 把当前登录的人一路带下来，
 * 这样 ai.ts 里的函数不用每个都多传一个 userId。不在请求里调用的（没有登录的人）记成 user_id = NULL。
 *
 * 余额：DeepSeek 有查余额的接口（GET {地址}/user/balance）。别家没有这个接口，查不到就不显示。
 * 结果缓存一分钟，免得每次打开桌宠菜单都去问；刚用过 AI 就作废缓存，下次重新查。
 */
export const aiUser = new AsyncLocalStorage<number>();

type Usage = {
  prompt_tokens?: unknown;
  completion_tokens?: unknown;
  prompt_cache_hit_tokens?: unknown; // DeepSeek 的写法
  prompt_tokens_details?: { cached_tokens?: unknown }; // OpenAI 的写法
};
const num = (v: unknown) => (typeof v === "number" && Number.isFinite(v) && v >= 0 ? Math.round(v) : 0);

/** 记下一次调用用了多少 token（接口没给 usage 就不记） */
export function recordUsage(model: string, usage: unknown) {
  if (!usage || typeof usage !== "object") return;
  const u = usage as Usage;
  const input = num(u.prompt_tokens);
  const output = num(u.completion_tokens);
  if (input + output === 0) return;
  const cached = num(u.prompt_cache_hit_tokens) || num(u.prompt_tokens_details?.cached_tokens);
  db.prepare("INSERT INTO ai_usage (user_id, model, input_tokens, output_tokens, cached_tokens) VALUES (?, ?, ?, ?, ?)").run(aiUser.getStore() ?? null, model, input, output, cached);
  balanceCache = null; // 花了钱，余额变了
}

export type UsageToday = { input: number; output: number; cached: number; total: number; calls: number };

/** 这个人今天一共用了多少 */
export function usageToday(uid: number): UsageToday {
  const today = new Date().toLocaleDateString("sv");
  const r = db
    .prepare(
      `SELECT COALESCE(SUM(input_tokens), 0) AS input, COALESCE(SUM(output_tokens), 0) AS output,
              COALESCE(SUM(cached_tokens), 0) AS cached, COUNT(*) AS calls
       FROM ai_usage WHERE user_id = ? AND created_at >= ?`,
    )
    .get(uid, `${today} 00:00:00`) as { input: number; output: number; cached: number; calls: number };
  return { ...r, total: r.input + r.output };
}

export type Balance = { currency: string; amount: number };
let balanceCache: { at: number; value: Balance | null } | null = null;
const BALANCE_TTL = 60_000;

/** 账户余额。查不到（别家的接口、没联网、密钥不对）返回 null */
export async function balance(): Promise<Balance | null> {
  if (balanceCache && Date.now() - balanceCache.at < BALANCE_TTL) return balanceCache.value;
  const baseUrl = (process.env.AI_BASE_URL ?? "").trim().replace(/\/+$/, "");
  const apiKey = (process.env.AI_API_KEY ?? "").trim();
  let value: Balance | null = null;
  if (/^https?:\/\//.test(baseUrl) && apiKey) {
    try {
      const res = await fetch(`${baseUrl}/user/balance`, { headers: { Authorization: `Bearer ${apiKey}` }, signal: AbortSignal.timeout(5000) });
      if (res.ok) {
        const body = (await res.json()) as { balance_infos?: { currency?: unknown; total_balance?: unknown }[] };
        const info = body.balance_infos?.[0];
        const amount = Number(info?.total_balance);
        if (info && Number.isFinite(amount)) value = { currency: typeof info.currency === "string" ? info.currency : "CNY", amount };
      }
    } catch {
      // 查不到就不显示
    }
  }
  balanceCache = { at: Date.now(), value };
  return value;
}
