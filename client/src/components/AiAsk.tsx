import { useEffect, useRef, useState, type FormEvent } from "react";
import { RefreshCw, Send } from "lucide-react";
import { api } from "../api";
import { AiSetupHint } from "./AiCapture";
import { SummaryText } from "./AiSummary";
import Modal from "./Modal";

/**
 * 「问我的数据」：问关于自己记录的问题，AI 根据最近 90 天的记录回答。
 * 只读——它改不了任何数据。对话只留在这个窗口里，关掉就没了。
 */
type Turn = { role: "user" | "assistant"; content: string };

const EXAMPLES = ["我这个月花得最多的是什么？", "最近两周体重变化怎么样？", "我有哪些任务逾期了？", "这周运动了几次？"];

export default function AiAsk({ onClose }: { onClose: () => void }) {
  const [status, setStatus] = useState<{ configured: boolean; model: string } | null>(null);
  const [turns, setTurns] = useState<Turn[]>([]);
  const [q, setQ] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const end = useRef<HTMLDivElement>(null);

  useEffect(() => {
    api.get<{ configured: boolean; model: string }>("/ai/status").then(setStatus, () => setStatus({ configured: false, model: "" }));
  }, []);
  useEffect(() => {
    end.current?.scrollIntoView({ block: "nearest" });
  }, [turns, busy]);

  const ask = async (question: string) => {
    question = question.trim();
    if (!question || busy) return;
    setError("");
    setQ("");
    const history = turns.slice(-8); // 只带最近几轮，够它接上话就行
    setTurns((t) => [...t, { role: "user", content: question }]);
    setBusy(true);
    try {
      const got = await api.post<{ answer: string }>("/ai/ask", { question, history });
      setTurns((t) => [...t, { role: "assistant", content: got.answer }]);
    } catch (err) {
      setError((err as Error).message);
      // 没问成：把这句话放回输入框，方便再发一次
      setTurns((t) => t.slice(0, -1));
      setQ(question);
    } finally {
      setBusy(false);
    }
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    ask(q);
  };

  return (
    <Modal title="问我的数据" onClose={onClose} wide>
      {status === null ? (
        <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : !status.configured ? (
        <AiSetupHint />
      ) : (
        <div className="flex flex-col gap-3">
          <div className="max-h-[52vh] min-h-40 space-y-3 overflow-y-auto pr-1">
            {turns.length === 0 && (
              <div className="rounded-2xl bg-ink/5 px-4 py-4 text-sm leading-7 text-slate-600">
                <p>可以问关于你自己记录的问题，比如：</p>
                <div className="mt-2 flex flex-wrap gap-2">
                  {EXAMPLES.map((x) => (
                    <button key={x} className="chip" onClick={() => ask(x)}>
                      {x}
                    </button>
                  ))}
                </div>
                <p className="mt-3 text-xs leading-relaxed text-slate-500">
                  每次提问时，你最近 90 天的记录（任务、清单、收支、随记、健身）会整理成一份材料发给 {status.model}。它只能看、不能改；数字是它读材料后算的，偶尔会算错，重要的数字以各页面自己的统计为准。
                </p>
              </div>
            )}
            {turns.map((t, i) =>
              t.role === "user" ? (
                <div key={i} className="ml-auto w-fit max-w-[85%] whitespace-pre-wrap rounded-2xl rounded-br-md bg-ink px-3.5 py-2 text-sm text-paper">
                  {t.content}
                </div>
              ) : (
                <div key={i} className="max-w-[92%] rounded-2xl rounded-bl-md bg-ink/5 px-4 py-3">
                  <SummaryText text={t.content} />
                </div>
              ),
            )}
            {busy && (
              <div className="flex w-fit items-center gap-2 rounded-2xl rounded-bl-md bg-ink/5 px-4 py-3 text-sm text-slate-500">
                <RefreshCw className="size-3.5 animate-spin" /> 正在翻你的记录…
              </div>
            )}
            <div ref={end} />
          </div>

          {error && <p className="rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

          <form onSubmit={submit} className="flex items-end gap-2">
            <input className="input" placeholder="问点什么…" value={q} onChange={(e) => setQ(e.target.value)} maxLength={500} aria-label="你的问题" autoFocus />
            <button className="btn-primary shrink-0" disabled={busy || !q.trim()}>
              <Send className="size-4" /> 发送
            </button>
          </form>
        </div>
      )}
    </Modal>
  );
}
