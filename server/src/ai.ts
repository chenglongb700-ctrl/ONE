import { existsSync } from "node:fs";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

/**
 * 调用 AI 模型。
 * 用的是"OpenAI 兼容"的对话接口（POST {地址}/chat/completions）——DeepSeek、通义千问、豆包、Kimi、智谱、
 * 硅基流动，以及本机的 Ollama 都支持这种写法，所以换模型只用改配置，不用改代码。
 *
 * 配置写在项目根目录的 .env 文件里（这个文件不进 git，照着 .env.example 填）：
 *   AI_BASE_URL  接口地址，例如 https://api.deepseek.com/v1
 *   AI_API_KEY   密钥（本机的 Ollama 不需要，可以不填）
 *   AI_MODEL     模型名，例如 deepseek-chat
 */
const envFile = resolve(dirname(fileURLToPath(import.meta.url)), "../../.env");
if (existsSync(envFile)) {
  try {
    process.loadEnvFile(envFile); // 已经在系统环境变量里设过的值不会被覆盖
  } catch (err) {
    console.warn(`.env 文件读取失败：${(err as Error).message}`);
  }
}

const TIMEOUT_MS = 120_000; // 写一篇月度总结可能要一分钟左右

const config = () => ({
  baseUrl: (process.env.AI_BASE_URL ?? "").trim().replace(/\/+$/, ""),
  apiKey: (process.env.AI_API_KEY ?? "").trim(),
  model: (process.env.AI_MODEL ?? "").trim(),
});

/** 配好了没有：至少要有接口地址和模型名 */
export function aiStatus(): { configured: boolean; model: string } {
  const c = config();
  return { configured: /^https?:\/\//.test(c.baseUrl) && c.model !== "", model: c.model };
}

/** 能直接讲给用户看的错误（中文） */
export class AiError extends Error {}

/** 给模型一段系统提示和一段用户内容，拿回它写的文字 */
export async function chat(system: string, user: string): Promise<{ text: string; model: string }> {
  const c = config();
  if (!aiStatus().configured) throw new AiError("还没有配置 AI 模型");

  let res: Response;
  try {
    res = await fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({
        model: c.model,
        messages: [
          { role: "system", content: system },
          { role: "user", content: user },
        ],
        temperature: 0.5,
        stream: false,
      }),
      signal: AbortSignal.timeout(TIMEOUT_MS),
    });
  } catch (err) {
    const name = (err as Error).name;
    throw new AiError(name === "TimeoutError" || name === "AbortError" ? "AI 模型两分钟没有回应，稍后再试" : `连不上 AI 模型的接口（${c.baseUrl}）`);
  }

  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; error?: { message?: unknown } | string } | null;
  if (!res.ok) {
    if (res.status === 401 || res.status === 403) throw new AiError("AI 模型拒绝了请求：密钥不对或者没有权限，检查 .env 里的 AI_API_KEY");
    if (res.status === 404) throw new AiError("AI 模型的接口地址或模型名不对，检查 .env 里的 AI_BASE_URL 和 AI_MODEL");
    if (res.status === 402) throw new AiError("AI 模型的账户余额不足");
    if (res.status === 429) throw new AiError("AI 模型那边请求太频繁或额度用完了，稍后再试");
    const detail = typeof body?.error === "string" ? body.error : typeof body?.error?.message === "string" ? body.error.message : "";
    throw new AiError(`AI 模型返回了错误（${res.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("AI 模型没有返回内容，再试一次");
  // 有的模型会把思考过程放在 <think> 标签里一起返回，去掉
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), model: c.model };
}
