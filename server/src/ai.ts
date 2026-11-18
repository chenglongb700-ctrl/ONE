import "./env.js"; // 读 .env
import { recordUsage } from "./aiUsage.js";

/**
 * 调用 AI 模型。
 * 用的是"OpenAI 兼容"的对话接口（POST {地址}/chat/completions）——DeepSeek、通义千问、豆包、Kimi、智谱、
 * 硅基流动，以及本机的 Ollama 都支持这种写法，所以换模型只用改配置，不用改代码。
 *
 * 配置写在项目根目录的 .env 文件里（这个文件不进 git，照着 .env.example 填）：
 *   AI_BASE_URL  接口地址，例如 https://api.deepseek.com
 *   AI_API_KEY   密钥（本机的 Ollama 不需要，可以不填）
 *   AI_MODEL     模型名，例如 deepseek-flash
 *
 * 两种调法：
 *   chat / chatMessages / chatJson  等模型整段写完再一次拿回来（要解析 JSON 的、很短的用这种）
 *   chatStream                      模型写一点就递过来一点（问答、总结用这种：一两秒就能开始看）
 */

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

export type ChatMessage = { role: "user" | "assistant"; content: string };

const isAbort = (err: unknown) => ["TimeoutError", "AbortError"].includes((err as Error)?.name);

/**
 * 发出请求，拿到模型接口的响应（还没读正文）。
 * - 连接偶尔会被对方断开（实测 DeepSeek 隔一阵会出现一次）：等一秒自动再试一次。超时和用户取消的不重试
 * - 对方返回错误状态时，翻译成中文的 AiError
 * signal：调用方的取消信号（比如用户关了窗口），一取消就不再等模型
 */
async function post(system: string, messages: ChatMessage[], temperature: number, stream: boolean, signal?: AbortSignal): Promise<Response> {
  const c = config();
  if (!aiStatus().configured) throw new AiError("还没有配置 AI 模型");
  const timeout = AbortSignal.timeout(TIMEOUT_MS);
  const send = () =>
    fetch(`${c.baseUrl}/chat/completions`, {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(c.apiKey ? { Authorization: `Bearer ${c.apiKey}` } : {}) },
      body: JSON.stringify({
        model: c.model,
        messages: [{ role: "system", content: system }, ...messages],
        temperature,
        stream,
        // 流式输出默认不告诉用了多少 token，要这样明确要一下（最后会多来一条只有 usage 的消息）
        ...(stream ? { stream_options: { include_usage: true } } : {}),
      }),
      signal: signal ? AbortSignal.any([timeout, signal]) : timeout,
    });

  let res: Response;
  try {
    try {
      res = await send();
    } catch (err) {
      if (isAbort(err)) throw err;
      await new Promise((r) => setTimeout(r, 1000));
      res = await send();
    }
  } catch (err) {
    if (signal?.aborted) throw err; // 用户自己取消的：原样抛出，调用方知道不用再报错
    throw new AiError(isAbort(err) ? "AI 模型两分钟没有回应，稍后再试" : `连不上 AI 模型的接口（${c.baseUrl}）`);
  }

  if (!res.ok) {
    const body = (await res.json().catch(() => null)) as { error?: { message?: unknown } | string } | null;
    if (res.status === 401 || res.status === 403) throw new AiError("AI 模型拒绝了请求：密钥不对或者没有权限，检查 .env 里的 AI_API_KEY");
    if (res.status === 404) throw new AiError("AI 模型的接口地址或模型名不对，检查 .env 里的 AI_BASE_URL 和 AI_MODEL");
    if (res.status === 402) throw new AiError("AI 模型的账户余额不足");
    if (res.status === 429) throw new AiError("AI 模型那边请求太频繁或额度用完了，稍后再试");
    const detail = typeof body?.error === "string" ? body.error : typeof body?.error?.message === "string" ? body.error.message : "";
    throw new AiError(`AI 模型返回了错误（${res.status}）${detail ? `：${detail.slice(0, 200)}` : ""}`);
  }
  return res;
}

/**
 * 有的模型会把思考过程放在 <think>…</think> 里一起返回，这部分不给用户看。
 * 流式输出时文字是一截一截来的：没写完的 <think> 块先整个藏起来，结尾刚好是半个"<think>"的也先压着，等下一截来了再说。
 */
function visible(text: string): string {
  let out = text.replace(/<think>[\s\S]*?<\/think>/g, "");
  const open = out.indexOf("<think>");
  if (open >= 0) out = out.slice(0, open);
  for (let n = Math.min(6, out.length); n > 0; n--) {
    if ("<think>".startsWith(out.slice(-n))) return out.slice(0, -n);
  }
  return out;
}

/** 给模型一段系统提示和一段用户内容，拿回它写的文字 */
export function chat(system: string, user: string, temperature = 0.5): Promise<{ text: string; model: string }> {
  return chatMessages(system, [{ role: "user", content: user }], temperature);
}

/** 多轮对话：一段系统提示，加上按顺序排好的几轮用户和 AI 的话（最后一条是用户的） */
export async function chatMessages(system: string, messages: ChatMessage[], temperature = 0.5): Promise<{ text: string; model: string }> {
  const res = await post(system, messages, temperature, false);
  const body = (await res.json().catch(() => null)) as { choices?: { message?: { content?: unknown } }[]; usage?: unknown } | null;
  recordUsage(config().model, body?.usage);
  const text = body?.choices?.[0]?.message?.content;
  if (typeof text !== "string" || !text.trim()) throw new AiError("AI 模型没有返回内容，再试一次");
  return { text: text.replace(/<think>[\s\S]*?<\/think>/g, "").trim(), model: config().model };
}

/**
 * 流式调用：模型每写出一截，就用 onText 把"到目前为止写好的全部文字"递出去；写完后返回完整的文字。
 * 接口按 OpenAI 的流式格式返回：一行一条 "data: {json}"，最后一条是 "data: [DONE]"。
 */
export async function chatStream(
  system: string,
  messages: ChatMessage[],
  temperature: number,
  onText: (textSoFar: string) => void,
  signal?: AbortSignal,
): Promise<{ text: string; model: string }> {
  const res = await post(system, messages, temperature, true, signal);
  if (!res.body) throw new AiError("AI 模型没有返回内容，再试一次");
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  let raw = "";
  let shown = 0;
  let usage: unknown = null;
  try {
    for (;;) {
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });
      let nl: number;
      while ((nl = buffer.indexOf("\n")) >= 0) {
        const line = buffer.slice(0, nl).trim();
        buffer = buffer.slice(nl + 1);
        if (!line.startsWith("data:")) continue; // 空行、": keep-alive" 之类的注释行
        const data = line.slice(5).trim();
        if (data === "[DONE]") continue;
        let chunk: { choices?: { delta?: { content?: unknown } }[]; error?: { message?: unknown }; usage?: unknown };
        try {
          chunk = JSON.parse(data);
        } catch {
          continue;
        }
        if (chunk.error) throw new AiError(`AI 模型中途出错了${typeof chunk.error.message === "string" ? `：${chunk.error.message.slice(0, 200)}` : ""}，再试一次`);
        if (chunk.usage) usage = chunk.usage;
        const piece = chunk.choices?.[0]?.delta?.content;
        if (typeof piece !== "string" || !piece) continue;
        raw += piece;
        const now = visible(raw);
        if (now.trimStart().length > shown) {
          shown = now.trimStart().length;
          onText(now.trimStart());
        }
      }
    }
  } catch (err) {
    if (signal?.aborted || err instanceof AiError) throw err;
    throw new AiError(isAbort(err) ? "AI 模型写得太久，超过两分钟停下了，再试一次" : "和 AI 模型的连接断了，回答没写完，再试一次");
  }
  recordUsage(config().model, usage);
  const text = raw.replace(/<think>[\s\S]*?<\/think>/g, "").trim();
  if (!text) throw new AiError("AI 模型没有返回内容，再试一次");
  return { text, model: config().model };
}

/**
 * 让模型只回 JSON，并把它解析出来。
 * 各家对"强制输出 JSON"的参数支持不一样，所以这里不用那个参数，只在提示词里要求，
 * 拿到文字后去掉可能包在外面的 ```代码围栏```，从第一个 { 或 [ 截到最后一个 } 或 ] 再解析。
 */
export async function chatJson(system: string, user: string): Promise<unknown> {
  const { text } = await chat(`${system}\n\n只输出 JSON 本身，不要任何解释，不要用代码块包起来。`, user, 0.2);
  const start = text.search(/[{[]/);
  const end = Math.max(text.lastIndexOf("}"), text.lastIndexOf("]"));
  if (start < 0 || end <= start) throw new AiError("AI 没有按要求的格式回答，再试一次");
  try {
    return JSON.parse(text.slice(start, end + 1));
  } catch {
    throw new AiError("AI 回答的格式有问题，没法读取，再试一次");
  }
}
