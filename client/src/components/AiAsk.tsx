import { useEffect, useRef, useState, type FormEvent } from "react";
import { MessageSquarePlus, RefreshCw, Send, Square } from "lucide-react";
import { api, isAbort } from "../api";
import { AiSetupHint } from "./AiCapture";
import { SummaryText } from "./AiSummary";
import SidePanel from "./SidePanel";
import type { PageAi } from "./pageAi";

/**
 * AI 问答窗口，两种用法：
 *   不传 page：「问我的数据」——根据最近 90 天所有记录的概要回答
 *   传 page：这个页面自己的助手——只看这个页面的内容回答，带几个针对这个页面的一键提问
 * 都是只读——它改不了任何数据。对话只留在这个窗口里，关掉就没了。
 * 回答是流式的：AI 写一点显示一点；可以点「停止」，关掉面板也会停（不再花钱）。
 * 放在右侧面板里（SidePanel），不挡住页面：可以一边看回答一边对照页面。
 */
type Turn = { role: "user" | "assistant"; content: string; stopped?: boolean };

const EXAMPLES = ["我这个月花得最多的是什么？", "最近两周体重变化怎么样？", "我有哪些任务逾期了？", "这周运动了几次？"];

export default function AiAsk({ onClose, page }: { onClose: () => void; page?: PageAi }) {
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [live, setLive] = useState(""); // 正在写的这条回答，到目前为止的文字
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);
  const stopper = useRef<AbortController | null>(null);
  const userStopped = useRef(false); // 是点了「停止」（留下写了一半的回答），还是关了窗口

  useEffect(() => {
    api.get<{ configured: boolean; model: string }>("/ai/status").then(setStatus, () => setStatus({ configured: false, model: "" }));
    return () => stopper.current?.abort(); // 关窗口：断开正在写的回答
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy, live]);

  const ask = async (question: string) => {
    question = question.trim();
    if (!question || busy) return;
    setError("");
    setQ("");
    const history = turns.slice(-8).map(({ role, content }) => ({ role, content })); // 只带最近几轮，够它接上话就行
    setTurns((t) => [...t, { role: "user", content: question }]);
    setBusy(true);
    setLive("");
    const ctrl = new AbortController();
    stopper.current = ctrl;
    userStopped.current = false;
    let soFar = "";
    try {
      const body = page ? { page: page.key, question, history } : { question, history };
      const got = await api.stream<{ answer: string }>(
        page ? "/ai/page" : "/ai/ask",
        body,
        (text) => {
          soFar = text;
          setLive(text);
        },
        ctrl.signal,
      );
      setTurns((t) => [...t, { role: "assistant", content: got.answer || soFar }]);
    } catch (err) {
      if (isAbort(err)) {
        // 点了「停止」：写了一半的留下来；什么都还没写出来，就当没问过
        if (userStopped.current && soFar.trim()) setTurns((t) => [...t, { role: "assistant", content: soFar, stopped: true }]);
        else if (userStopped.current) {
          setTurns((t) => t.slice(0, -1));
          setQ(question);
        }
        return;
      }
      setError((err as Error).message);
      // 没问成：把这句话放回输入框，方便再发一次（写了一半的也不留，免得看着像完整的回答）
      setTurns((t) => t.slice(0, -1));
      setQ(question);
    } finally {
      if (stopper.current === ctrl) {
        stopper.current = null;
        setBusy(false);
        setLive("");
      }
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(q);
  };
  const stop = () => {
    userStopped.current = true;
    stopper.current?.abort();
  };
  const restart = () => {
    setTurns([]);
    setError("");
  };

  return (
    <SidePanel
      title={page ? `${page.name}助手` : "问我的数据"}
      sub={status?.configured ? `${page ? `看的是「${page.name}」页面的内容` : "看的是你最近 90 天的全部记录"} · ${status.model}` : undefined}
      actions={
        turns.length > 0 &&
        !busy && (
          <button className="btn-ghost p-1.5" onClick={restart} title="新对话（清空上面的对话）" aria-label="新对话">
            <MessageSquarePlus className="size-4" />
          </button>
        )
      }
      onClose={onClose}
    >
      {status === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : !status.configured ? (
        <AiSetupHint />
      ) : (
        <>
          <div className="-mr-2 min-h-0 flex-1 space-y-5 overflow-y-auto overscroll-contain pr-2 pt-1">
            {turns.length === 0 && (
              <div className="pt-2">
                <p className="text-sm text-slate-600">{page ? `针对「${page.name}」这个页面提问，比如：` : "问关于你自己记录的问题，比如："}</p>
                <div className="mt-3 space-y-2">
                  {(page?.examples ?? EXAMPLES).map((x) => (
                    <button key={x} className="block w-full cursor-pointer rounded-xl bg-ink/5 px-3.5 py-2.5 text-left text-sm transition hover:bg-ink/10" onClick={() => ask(x)}>
                      {x}
                    </button>
                  ))}
                </div>
                <p className="mt-4 text-xs leading-relaxed text-slate-500">
                  每次提问时，{page ? page.sends : "你最近 90 天的记录（任务、清单、收支、随记、健身）"}会整理成一份材料发给 {status.model}。它只能看、不能改；数字是它读材料后算的，偶尔会算错，重要的数字以页面自己的统计为准。
                </p>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-paper">
                  {t.content}
                </div>
              ) : (
                <div key={i}>
                  <SummaryText text={t.content} />
                  {t.stopped && <p className="mt-2 text-xs text-slate-500">（已停止，回答没写完）</p>}
                </div>
              ),
            )}
            {busy &&
              (live ? (
                <div>
                  <SummaryText text={live} />
                  <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" aria-hidden />
                </div>
              ) : (
                <div className="flex items-center gap-2 text-sm text-slate-500">
                  <RefreshCw className="size-3.5 animate-spin" /> {page ? "正在看这个页面的内容…" : "正在翻你的记录…"}
                </div>
              ))}
            <div ref={end} />
          </div>

          {error && <p className="mt-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

          <form onSubmit={submit} className="mt-3 flex items-end gap-2">
            <input className="input" placeholder="问点什么…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="你的问题" autoFocus />
            {busy ? (
              <button type="button" className="btn shrink-0 bg-ink/8 hover:bg-ink/12" onClick={stop}>
                <Square className="size-3.5 fill-current" /> 停止
              </button>
            ) : (
              <button className="btn-primary shrink-0" disabled={!q.trim()} aria-label="发送">
                <Send className="size-4" />
              </button>
            )}
          </form>
        </>
      )}
    </SidePanel>
  );
}
