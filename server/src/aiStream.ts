import type { Request, Response } from "express";
import { AiError } from "./ai.js";

/**
 * 把模型边写边出的文字，边收边转给浏览器。
 *
 * 响应是一行一个 JSON（NDJSON，Content-Type: application/x-ndjson）：
 *   {"t":"新写出来的一截文字"}      写一截发一行
 *   {"done":true, …work 的返回值}   写完了（比如总结会带上存好的那一份）
 *   {"error":"中文的出错原因"}      中途出错（这时状态码已经是 200 了，只能这样告诉浏览器）
 *
 * 浏览器那边关掉窗口、断开连接时，signal 会被触发，正在进行的模型请求跟着停下（不再花钱），结果也不保存。
 * 要在调用这个函数之前做完所有检查（参数、配没配模型、是不是正在忙）：那些错误要用普通的 4xx JSON 返回。
 */
export async function streamReply(
  req: Request,
  res: Response,
  work: (onText: (textSoFar: string) => void, signal: AbortSignal) => Promise<Record<string, unknown>>,
): Promise<void> {
  const stop = new AbortController();
  res.on("close", () => {
    if (!res.writableFinished) stop.abort(); // 还没写完连接就断了：是浏览器那边走了
  });

  res.status(200);
  res.setHeader("Content-Type", "application/x-ndjson; charset=utf-8");
  res.setHeader("Cache-Control", "no-cache, no-transform");
  res.setHeader("X-Accel-Buffering", "no"); // 万一以后前面挂了 nginx，别让它把整段攒起来再发
  res.flushHeaders();

  const line = (obj: unknown) => res.write(`${JSON.stringify(obj)}\n`);
  let sent = 0;
  const onText = (textSoFar: string) => {
    if (textSoFar.length <= sent) return;
    line({ t: textSoFar.slice(sent) }); // 只发新写出来的那一截
    sent = textSoFar.length;
  };

  try {
    const extra = await work(onText, stop.signal);
    res.end(`${JSON.stringify({ done: true, ...extra })}\n`);
  } catch (err) {
    if (stop.signal.aborted) return void res.end(); // 浏览器已经走了，没人听
    if (!(err instanceof AiError)) console.error(`[ai stream] ${req.method} ${req.originalUrl}`, err);
    res.end(`${JSON.stringify({ error: err instanceof AiError ? err.message : "服务器错误" })}\n`);
  }
}
