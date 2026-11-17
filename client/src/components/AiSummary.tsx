import { useEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { RefreshCw, Sparkles } from "lucide-react";
import { api, isAbort } from "../api";
import Modal from "./Modal";

/**
 * AI 总结：一个按钮，点开是弹窗——选"每日 / 每周 / 每月"，按一下就让模型写一份总结。
 *   kind = personal  总结自己的记录（放在总览页）
 *   kind = news      总结资讯里的文章（放在资讯页）
 * 写好的总结存在服务器上，下次打开同一个时间段直接看；想更新就点"重新生成"。
 * 生成是流式的：AI 写一点显示一点。写的过程中关掉窗口就停下，不保存（也不再花钱）。
 */
type Kind = "personal" | "news";
type Period = "day" | "week" | "month";
export type Summary = { content: string; model: string; start: string; end: string; createdAt: string };
export type SummaryState = { configured: boolean; model: string; range: { start: string; end: string }; summary: Summary | null };

const PERIODS: { key: Period; label: string; name: string }[] = [
  { key: "day", label: "每日", name: "今天" },
  { key: "week", label: "每周", name: "本周" },
  { key: "month", label: "每月", name: "本月" },
];

const TEXT: Record<Kind, { title: string; what: string }> = {
  personal: { title: "AI 总结", what: "任务、收支、随记和生活清单" },
  news: { title: "AI 资讯简报", what: "「资讯」里订阅来源发布的文章标题和摘要" },
};

const md = (date: string) => `${Number(date.slice(5, 7))}月${Number(date.slice(8, 10))}日`;
const when = (iso: string) => new Intl.DateTimeFormat("zh-CN", { month: "numeric", day: "numeric", hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(iso));

/** 把模型写的文字排出来：只认"## 小标题"和"- 列表"两种记号，其余都是普通段落 */
export function SummaryText({ text }: { text: string }) {
  const blocks: { type: "h" | "ul" | "p"; lines: string[] }[] = [];
  for (const raw of text.split("\n")) {
    const line = raw.trim().replace(/\*\*/g, ""); // 万一模型还是用了加粗，把星号去掉
    if (!line) continue;
    const last = blocks[blocks.length - 1];
    if (/^#{1,4}\s+/.test(line)) blocks.push({ type: "h", lines: [line.replace(/^#{1,4}\s+/, "")] });
    else if (/^[-*•]\s+/.test(line)) {
      const item = line.replace(/^[-*•]\s+/, "");
      if (last?.type === "ul") last.lines.push(item);
      else blocks.push({ type: "ul", lines: [item] });
    } else blocks.push({ type: "p", lines: [line] });
  }
  return (
    <div className="space-y-2.5 text-sm leading-7">
      {blocks.map((b, i) =>
        b.type === "h" ? (
          <h3 key={i} className="pt-2 text-[15px] font-semibold first:pt-0">
            {b.lines[0]}
          </h3>
        ) : b.type === "ul" ? (
          <ul key={i} className="space-y-1.5">
            {b.lines.map((l, j) => (
              <li key={j} className="flex gap-2.5">
                <span className="mt-[0.7em] size-1.5 shrink-0 rounded-full bg-brand" aria-hidden />
                <span className="min-w-0">{l}</span>
              </li>
            ))}
          </ul>
        ) : (
          <p key={i}>{b.lines[0]}</p>
        ),
      )}
    </div>
  );
}

function SummaryDialog({ kind, onClose }: { kind: Kind; onClose: () => void }) {
  const [period, setPeriod] = useState<Period>("day");
  const [state, setState] = useState<SummaryState | null>(null);
  const [working, setWorking] = useState<Period | null>(null); // 正在生成哪个时间段的
  const [error, setError] = useState("");
  const [live, setLive] = useState(""); // 正在写的总结，到目前为止的文字
  const current = useRef(period); // 请求回来时用户可能已经切到别的时间段了
  const stopper = useRef<AbortController | null>(null);
  useEffect(() => () => stopper.current?.abort(), []); // 关窗口：停止正在写的总结

  useEffect(() => {
    current.current = period;
    setState(null);
    setError("");
    api.get<SummaryState>(`/summary?kind=${kind}&period=${period}`).then(
      (got) => current.current === period && setState(got),
      (err) => current.current === period && setError((err as Error).message),
    );
  }, [kind, period]);

  const generate = async () => {
    const p = period;
    setWorking(p);
    setError("");
    setLive("");
    const ctrl = new AbortController();
    stopper.current = ctrl;
    try {
      const got = await api.stream<{ summary: Summary }>("/summary", { kind, period: p }, setLive, ctrl.signal);
      if (current.current === p) setState((s) => s && { ...s, summary: got.summary });
    } catch (err) {
      if (isAbort(err)) return;
      if (current.current === p) setError((err as Error).message);
    } finally {
      if (stopper.current === ctrl) {
        stopper.current = null;
        setWorking(null);
        setLive("");
      }
    }
  };

  const P = PERIODS.find((x) => x.key === period)!;
  const busy = working !== null;
  const range = state ? (state.range.start === state.range.end ? md(state.range.start) : `${md(state.range.start)} – ${md(state.range.end)}`) : "";

  return (
    <Modal title={TEXT[kind].title} onClose={onClose} wide>
      <div className="mb-4 flex flex-wrap items-center gap-3">
        <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="总结哪段时间">
          {PERIODS.map((x) => (
            <button key={x.key} role="radio" aria-checked={period === x.key} disabled={busy} onClick={() => setPeriod(x.key)} className={`cursor-pointer rounded-lg px-3.5 py-1 transition disabled:cursor-default ${period === x.key ? "bg-surface font-medium shadow-sm" : "text-slate-600 hover:text-ink"}`}>
              {x.label}
            </button>
          ))}
        </div>
        <span className="text-xs text-slate-500">
          {P.name}
          {range && `（${range}）`}
        </span>
        {state?.configured && (
          <button className="btn-primary ml-auto" onClick={generate} disabled={busy}>
            {busy ? <RefreshCw className="size-4 animate-spin" /> : <Sparkles className="size-4" />}
            {busy ? "正在写…" : state.summary ? "重新生成" : "生成总结"}
          </button>
        )}
      </div>

      {error && <p className="mb-3 rounded-xl bg-red-500/10 px-3.5 py-2.5 text-sm text-red-600">{error}</p>}

      {state === null ? (
        !error && <div className="h-40 animate-pulse rounded-2xl bg-ink/5" />
      ) : !state.configured ? (
        <div className="rounded-2xl bg-ink/5 px-4 py-4 text-sm leading-7">
          <p className="font-medium">还没有配置 AI 模型</p>
          <p className="mt-1 text-slate-600">
            在项目文件夹里把 <code className="font-mono text-[13px]">.env.example</code> 复制一份，改名为 <code className="font-mono text-[13px]">.env</code>，填上你用的模型的接口地址、密钥和模型名（文件里有 DeepSeek、通义千问、豆包、Kimi、智谱、Ollama 的写法），然后重启网站。
          </p>
        </div>
      ) : busy && working === period ? (
        live ? (
          <>
            <div className="rounded-2xl bg-ink/5 px-4 py-4 sm:px-5">
              <SummaryText text={live} />
              <span className="mt-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-brand align-middle" aria-hidden />
            </div>
            <p className="mt-2.5 text-xs text-slate-500">{state.model} 正在写…写完会自动保存；现在关掉窗口就停下，不保存。</p>
          </>
        ) : (
          <div className="rounded-2xl bg-ink/5 px-4 py-10 text-center text-sm text-slate-500">正在让 {state.model} 看{P.name}的内容，马上开始写…</div>
        )
      ) : state.summary ? (
        <>
          <div className="rounded-2xl bg-ink/5 px-4 py-4 sm:px-5">
            <SummaryText text={state.summary.content} />
          </div>
          <p className="mt-2.5 text-xs text-slate-500">
            {when(state.summary.createdAt)} 由 {state.summary.model} 生成，内容截至当时。AI 写的总结可能有出入，以你自己的记录为准。
          </p>
        </>
      ) : (
        <div className="rounded-2xl bg-ink/5 px-4 py-10 text-center text-sm text-slate-500">
          {P.name}的总结还没有生成。点右上方的「生成总结」。
          <span className="mt-1.5 block text-xs">
            生成时会把{P.name}的{TEXT[kind].what}发给 {state.model}。
          </span>
        </div>
      )}
    </Modal>
  );
}

/** 打开总结弹窗的按钮。className 决定按钮长什么样 */
export default function AiSummaryButton({ kind, className = "btn bg-ink/8 hover:bg-ink/12", label }: { kind: Kind; className?: string; label?: string }) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button className={className} onClick={() => setOpen(true)}>
        <Sparkles className="size-4 text-brand" /> {label ?? TEXT[kind].title}
      </button>
      {/* 弹窗挂到 body 上：按钮可能放在毛玻璃卡片里，而毛玻璃会把里面的"全屏浮层"框在卡片范围内 */}
      {open && createPortal(<SummaryDialog kind={kind} onClose={() => setOpen(false)} />, document.body)}
    </>
  );
}
