import { useEffect, useRef, useState } from "react";
import { BookmarkPlus, GitFork, RefreshCw, Search, Star } from "lucide-react";
import { toast } from "sonner";
import { api, type TrendingRepo } from "../api";
import { PageHeader } from "../components/Modal";
import { DROPPED_EVENT } from "../components/DropZone";

type Data = {
  /** 这份榜单是哪一天的；一份都还没有时为 null */
  date: string | null;
  fetchedAt: string | null;
  failedPages: number;
  items: TrendingRepo[];
  /** 有榜单的日期，从新到旧 */
  dates: string[];
  /** 全部分类，按固定顺序 */
  categories: string[];
  /** 今天的榜单还没有，或者已经是 6 小时前的了 */
  stale: boolean;
};

const today = () => new Date().toLocaleDateString("sv");

/** 12345 → 12.3k：星标数只看个大概就够了 */
const short = (n: number) => (n >= 1000 ? `${(n / 1000).toFixed(n >= 100_000 ? 0 : 1)}k` : String(n));

function dateLabel(date: string) {
  const days = Math.round((Date.parse(today()) - Date.parse(date)) / 86_400_000);
  if (days === 0) return "今天";
  if (days === 1) return "昨天";
  const [, m, d] = date.split("-");
  return `${Number(m)}月${Number(d)}日`;
}

export default function Trending() {
  const [data, setData] = useState<Data | null>(null);
  const [date, setDate] = useState<string | null>(null); // null = 最新的一天
  const [view, setView] = useState<"category" | "rank">("category");
  const [cat, setCat] = useState<string | null>(null);
  const [lang, setLang] = useState("");
  const [q, setQ] = useState("");
  const [refreshing, setRefreshing] = useState(false);
  const refreshRunning = useRef(false);

  const load = async (d: string | null) => {
    try {
      const got = await api.get<Data>(`/trending${d ? `?date=${d}` : ""}`);
      setData(got);
      return got;
    } catch (err) {
      toast.error((err as Error).message);
      return null;
    }
  };

  // 让服务器去 GitHub 重新读一遍今天的榜单（要十秒左右），读完切到今天
  const refresh = async (force: boolean) => {
    if (refreshRunning.current) return;
    refreshRunning.current = true;
    setRefreshing(true);
    try {
      await api.post("/trending/refresh", { force });
      setDate(null);
      const got = await load(null);
      if (force && got) toast.success(got.failedPages ? `已更新，但有 ${got.failedPages} 个语言的榜单没读到，排名可能不全` : "已更新到最新");
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      refreshRunning.current = false;
      setRefreshing(false);
    }
  };

  // 打开页面：先把已有的榜单显示出来；今天的还没有（或者太旧）就自动更新一次
  useEffect(() => {
    load(null).then((got) => {
      if (got?.stale) refresh(false);
    });
  }, []);

  const pickDate = (d: string) => {
    setDate(d);
    load(d);
  };

  const addToSites = async (r: TrendingRepo) => {
    try {
      await api.post("/drop", { text: `https://github.com/${r.fullName}` });
      window.dispatchEvent(new CustomEvent(DROPPED_EVENT));
      toast.success(`已把 ${r.fullName} 放进「网址 › 开发」`);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const all = data?.items ?? [];
  const kw = q.trim().toLowerCase();
  const shown = all.filter((r) => (!cat || r.category === cat) && (!lang || r.language === lang) && (!kw || `${r.fullName} ${r.description}`.toLowerCase().includes(kw)));
  const count = (c: string) => all.filter((r) => r.category === c).length;
  const cats = (data?.categories ?? []).filter((c) => count(c) > 0);
  // 语言按出现次数从多到少排
  const langs = [...new Set(all.map((r) => r.language).filter(Boolean))].sort((a, b) => all.filter((r) => r.language === b).length - all.filter((r) => r.language === a).length);

  // 按分类看：每个分类一组，组的顺序按项目多少；按热度看：就是一整个榜单
  const groups =
    view === "rank"
      ? [{ title: "", items: shown }]
      : cats
          .map((c) => ({ title: c, items: shown.filter((r) => r.category === c) }))
          // "其他"不管有多少个都放最后
          .sort((a, b) => Number(a.title === "其他") - Number(b.title === "其他") || b.items.length - a.items.length);

  const filtered = cat !== null || lang !== "" || kw !== "";
  const updated = data?.fetchedAt ? new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(new Date(data.fetchedAt)) : "";

  return (
    <div>
      <PageHeader
        title="GitHub 热门"
        sub={data?.date ? `${dateLabel(data.date)}星标涨得最快的 ${all.length} 个项目 · ${updated} 更新` : "每天星标涨得最快的 50 个项目"}
        action={
          <button className="btn bg-ink/8 hover:bg-ink/12" onClick={() => refresh(true)} disabled={refreshing} title="去 GitHub 重新读一遍今天的榜单">
            <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "更新中…" : "刷新"}
          </button>
        }
      />

      {data && all.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="排列方式">
              {(
                [
                  ["category", "按分类"],
                  ["rank", "按热度"],
                ] as const
              ).map(([v, label]) => (
                <button key={v} role="radio" aria-checked={view === v} onClick={() => setView(v)} className={`cursor-pointer rounded-lg px-3 py-1 transition ${view === v ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`}>
                  {label}
                </button>
              ))}
            </div>
            <div className="relative w-full max-w-56">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="搜索项目名和简介…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索项目" />
            </div>
            <select className="input w-auto cursor-pointer" value={lang} onChange={(e) => setLang(e.target.value)} aria-label="编程语言">
              <option value="">全部语言</option>
              {langs.map((l) => (
                <option key={l} value={l}>
                  {l}（{all.filter((r) => r.language === l).length}）
                </option>
              ))}
            </select>
            {/* 存了不止一天的榜单时，可以回头看前几天的 */}
            {data.dates.length > 1 && (
              <select className="input ml-auto w-auto cursor-pointer" value={data.date ?? ""} onChange={(e) => pickDate(e.target.value)} aria-label="哪一天的榜单">
                {data.dates.map((d) => (
                  <option key={d} value={d}>
                    {dateLabel(d)}
                    {dateLabel(d).includes("月") ? "" : `（${d.slice(5)}）`}
                  </option>
                ))}
              </select>
            )}
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={cat === null ? "chip-on" : "chip"} onClick={() => setCat(null)}>
              全部 {all.length}
            </button>
            {cats.map((c) => (
              <button key={c} className={cat === c ? "chip-on" : "chip"} onClick={() => setCat(cat === c ? null : c)}>
                {c} {count(c)}
              </button>
            ))}
          </div>
        </div>
      )}

      {data === null ? (
        <div className="card h-40 animate-pulse" />
      ) : all.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-slate-500">{refreshing ? "正在从 GitHub 读取今天的热门榜，大约要十秒…" : "还没有榜单。点右上角的「刷新」读取一次。"}</div>
      ) : shown.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          没有符合条件的项目。
          {filtered && (
            <button
              className="ml-1 cursor-pointer underline underline-offset-4 hover:text-ink"
              onClick={() => {
                setQ("");
                setCat(null);
                setLang("");
              }}
            >
              清除筛选
            </button>
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups
            .filter((g) => g.items.length > 0)
            .map((g) => (
              <section key={g.title}>
                {g.title && (
                  <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-medium">
                    {g.title}
                    <span className="text-xs font-normal text-slate-500">{g.items.length}</span>
                  </h2>
                )}
                <ul className="card divide-y divide-line !py-1">
                  {g.items.map((r) => {
                    const [owner, name] = r.fullName.split("/");
                    return (
                      <li key={r.fullName} className="group flex items-start gap-3 py-3">
                        {/* 名次：始终是它在整个榜单里的名次，按分类看时也一样 */}
                        <span className="w-7 shrink-0 pt-0.5 text-right text-lg font-light tabular-nums leading-none text-slate-500" title={`第 ${r.rank} 名`}>
                          {r.rank}
                        </span>
                        <div className="min-w-0 flex-1">
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
                            <a href={`https://github.com/${r.fullName}`} target="_blank" rel="noreferrer noopener" className="min-w-0 break-words leading-snug underline-offset-4 hover:underline">
                              <span className="text-slate-500">{owner} / </span>
                              <span className="font-medium">{name}</span>
                            </a>
                            {r.isNew && (
                              <span className="rounded-md bg-brand/15 px-1.5 py-0.5 text-xs text-brand" title="上一份榜单里没有它">
                                新上榜
                              </span>
                            )}
                          </div>
                          {r.description && <p className="mt-1 line-clamp-2 text-sm leading-relaxed text-slate-600">{r.description}</p>}
                          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500">
                            {view === "rank" && (
                              <button className="tag cursor-pointer hover:text-ink" onClick={() => setCat(r.category)} title="只看这个分类">
                                {r.category}
                              </button>
                            )}
                            {r.language && <span>{r.language}</span>}
                            <span className="flex items-center gap-1" title={`${r.stars.toLocaleString()} 个星标`}>
                              <Star className="size-3" /> {short(r.stars)}
                            </span>
                            <span className="flex items-center gap-1" title={`${r.forks.toLocaleString()} 个分支`}>
                              <GitFork className="size-3" /> {short(r.forks)}
                            </span>
                          </div>
                        </div>
                        <div className="flex shrink-0 flex-col items-end gap-1">
                          <span className="whitespace-nowrap text-sm font-medium tabular-nums text-brand" title="今天新增的星标">
                            +{r.starsToday.toLocaleString()}
                          </span>
                          <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="收进「网址」" aria-label={`把 ${r.fullName} 收进网址`} onClick={() => addToSites(r)}>
                            <BookmarkPlus className="size-3.5" />
                          </button>
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
        </div>
      )}

      {data && all.length > 0 && (
        <p className="mt-6 px-1 text-xs leading-relaxed text-slate-500">
          数据来自{" "}
          <a href="https://github.com/trending" target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
            GitHub Trending
          </a>
          ：把总榜和 15 种主流语言的榜单合在一起，按今天新增的星标数取前 50。右边的 +数字就是今天新增的星标。 分类是按项目名和简介里的关键词判断的，没有用 AI，偶尔会分错。
        </p>
      )}
    </div>
  );
}
