import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ArrowLeft, CheckCheck, CircleAlert, Languages, Pencil, Plus, RefreshCw, Rss, Search, Sparkles, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Article, type Feed } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import AiSummaryButton from "../components/AiSummary";
import { hostOf, normalizeUrl } from "../url";

type Page = { items: Article[]; hasMore: boolean; unread: Record<string, number> };
type Refreshed = { busy: boolean; checked: number; added: number; failed: { title: string; error: string }[] };

const topicName = (t: string) => t || "未分类";

const startOfDay = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();

/** 文章按天分组时每组的标题：今天 / 昨天 / 11月13日 周五 */
function dayLabel(iso: string) {
  const d = new Date(iso);
  const days = Math.round((startOfDay(new Date()) - startOfDay(d)) / 86_400_000);
  if (days <= 0) return "今天";
  if (days === 1) return "昨天";
  return new Intl.DateTimeFormat("zh-CN", { month: "long", day: "numeric", weekday: "short", ...(days > 300 ? { year: "numeric" } : {}) }).format(d);
}

/** 一天之内的写"3 小时前"，更早的写几点几分（哪一天已经在分组标题上了） */
function timeLabel(iso: string) {
  const d = new Date(iso);
  const mins = Math.floor((Date.now() - d.getTime()) / 60_000);
  if (mins < 1) return "刚刚";
  if (mins < 60) return `${mins} 分钟前`;
  if (mins < 24 * 60) return `${Math.floor(mins / 60)} 小时前`;
  return new Intl.DateTimeFormat("zh-CN", { hour: "2-digit", minute: "2-digit", hour12: false }).format(d);
}

type FeedDraft = { id?: number; url: string; title: string; topic: string };

export default function News() {
  const [page, setPage] = useState<Page | null>(null);
  const [feeds, setFeeds] = useState<Feed[]>([]);
  const [topic, setTopic] = useState<string | null>(null); // null = 全部主题
  const [unreadOnly, setUnreadOnly] = useState(false);
  const [q, setQ] = useState("");
  const [kw, setKw] = useState(""); // 真正拿去搜的关键词：打字停下来一小会儿才更新，不用每敲一个字就查一次
  const [refreshing, setRefreshing] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [managing, setManaging] = useState(false);
  const [draft, setDraft] = useState<FeedDraft | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const seq = useRef(0); // 每发一次请求加一：回来的如果不是最后一次发的，说明筛选条件已经变了，丢掉

  const query = (offset: number) => {
    const p = new URLSearchParams();
    if (topic !== null) p.set("topic", topic);
    if (unreadOnly) p.set("unread", "1");
    if (kw) p.set("q", kw);
    if (offset) p.set("offset", String(offset));
    return `/news?${p}`;
  };

  const load = async () => {
    const mine = ++seq.current;
    try {
      const data = await api.get<Page>(query(0));
      if (mine === seq.current) setPage(data);
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const loadFeeds = () => api.get<Feed[]>("/news/feeds").then(setFeeds);

  useEffect(() => {
    const t = setTimeout(() => setKw(q.trim()), 300);
    return () => clearTimeout(t);
  }, [q]);

  useEffect(() => {
    load();
  }, [topic, unreadOnly, kw]);

  // 让服务器去读一遍来源。打开页面时自动调一次（只读超过半小时没读过的），点"刷新"时全部重读
  const refreshRunning = useRef(false); // 已经有一次在跑了就不再发第二次（开发模式下 React 会把"打开页面时"的动作执行两遍）
  const refresh = async (force: boolean) => {
    if (refreshRunning.current) return;
    refreshRunning.current = true;
    setRefreshing(true);
    try {
      const r = await api.post<Refreshed>("/news/refresh", { force });
      // busy：这个账号在别的窗口里正在更新。等它一会儿，再把列表重新读一遍
      if (r.busy) await new Promise((done) => setTimeout(done, 8000));
      await Promise.all([load(), loadFeeds()]);
      if (force && !r.busy) {
        if (r.failed.length) toast.message(`更新完了，新增 ${r.added} 篇`, { description: `有 ${r.failed.length} 个来源没读到：${r.failed.map((f) => f.title).join("、")}。可以在"管理来源"里看原因。` });
        else toast.success(r.added ? `新增 ${r.added} 篇` : "没有新文章");
      }
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      refreshRunning.current = false;
      setRefreshing(false);
    }
  };

  useEffect(() => {
    loadFeeds();
    refresh(false);
  }, []);

  const loadMore = async () => {
    if (!page) return;
    setLoadingMore(true);
    const mine = seq.current;
    try {
      const more = await api.get<Page>(query(page.items.length));
      if (mine === seq.current) setPage({ ...more, items: [...page.items, ...more.items] });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setLoadingMore(false);
    }
  };

  // ---------- 已读 / 未读 ----------
  // 先改页面上的显示，再告诉服务器：点一下马上有反应，不用等
  const setRead = (a: Article, read: boolean) => {
    if (a.read === read) return;
    setPage((p) =>
      p && {
        ...p,
        items: p.items.map((x) => (x.id === a.id ? { ...x, read } : x)),
        unread: { ...p.unread, [a.topic]: Math.max(0, (p.unread[a.topic] ?? 0) + (read ? -1 : 1)) },
      },
    );
    api.put(`/news/${a.id}`, { read }).catch((err) => {
      toast.error((err as Error).message);
      load();
    });
  };

  const readAll = async () => {
    const scope = topic === null ? "全部" : `「${topicName(topic)}」里的`;
    if (!(await confirmDialog({ title: "全部标为已读？", message: `${scope}文章都会标为已读。`, confirmText: "标为已读", danger: false }))) return;
    try {
      await api.post("/news/read-all", topic === null ? {} : { topic });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // ---------- 来源 ----------
  const topics = useMemo(() => [...new Set(feeds.filter((f) => f.enabled).map((f) => f.topic))], [feeds]);
  const allTopics = useMemo(() => [...new Set(feeds.map((f) => f.topic).filter(Boolean))], [feeds]);
  const unreadTotal = Object.values(page?.unread ?? {}).reduce((a, b) => a + b, 0);

  // ---------- AI：翻译标题、单篇摘要 ----------
  const [aiBusy, setAiBusy] = useState<"translate" | number | null>(null); // 正在翻译，或者正在给哪一篇写摘要
  const patchArticle = (id: number, p: Partial<Article>) => setPage((pg) => pg && { ...pg, items: pg.items.map((x) => (x.id === id ? { ...x, ...p } : x)) });
  // 当前列表里标题没有中文、也还没翻过的
  const untranslated = (page?.items ?? []).filter((a) => !a.titleZh && !/[\u4e00-\u9fff]/.test(a.title));

  const translate = async () => {
    if (aiBusy !== null || untranslated.length === 0) return;
    setAiBusy("translate");
    try {
      let done = 0;
      // 一次最多 40 条，多了分几批
      for (let i = 0; i < untranslated.length; i += 40) {
        const got = await api.post<{ items: { id: number; titleZh: string }[] }>("/news/translate", { ids: untranslated.slice(i, i + 40).map((a) => a.id) });
        got.items.forEach((t) => patchArticle(t.id, { titleZh: t.titleZh }));
        done += got.items.length;
      }
      toast.success(`翻译了 ${done} 个标题`);
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAiBusy(null);
    }
  };

  const summarize = async (a: Article) => {
    if (aiBusy !== null) return;
    setAiBusy(a.id);
    try {
      const got = await api.post<{ aiSummary: string }>(`/news/${a.id}/summary`);
      patchArticle(a.id, { aiSummary: got.aiSummary });
    } catch (err) {
      toast.error((err as Error).message);
    } finally {
      setAiBusy(null);
    }
  };

  const closeManage = () => {
    setManaging(false);
    setDraft(null);
    load();
  };

  const saveFeed = async (e: FormEvent) => {
    e.preventDefault();
    if (!draft) return;
    setError("");
    const body = { url: normalizeUrl(draft.url), title: draft.title.trim(), topic: draft.topic.trim() };
    if (!draft.id && !body.url) return setError("请填写地址");
    if (draft.id && !body.title) return setError("名称不能为空");
    setSaving(true);
    try {
      if (draft.id) {
        await api.put(`/news/feeds/${draft.id}`, { title: body.title, topic: body.topic });
        toast.success("已保存修改");
      } else {
        const f = await api.post<Feed>("/news/feeds", body);
        toast.success(`已添加「${f.title}」，读到 ${f.articles} 篇文章`);
      }
      setDraft(null);
      await loadFeeds();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  const toggleFeed = async (f: Feed) => {
    try {
      await api.put(`/news/feeds/${f.id}`, { enabled: !f.enabled });
      loadFeeds();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const removeFeed = async (f: Feed) => {
    if (!(await confirmDialog({ title: "删除这个来源？", message: `「${f.title}」和它已经读回来的 ${f.articles} 篇文章都会删掉。只是暂时不想看的话，取消勾选停用它就行。` }))) return;
    try {
      await api.del(`/news/feeds/${f.id}`);
      toast.success("已删除");
      if (topic === f.topic) setTopic(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
    loadFeeds();
  };

  const restoreFeeds = async () => {
    try {
      const { added } = await api.post<{ added: number }>("/news/feeds/restore");
      toast.success(added ? `补回了 ${added} 个内置来源，关掉这个窗口后点"刷新"读取文章` : "内置来源都在，没有需要补的");
      loadFeeds();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  // 文章按天分成几组（服务器已经按时间从新到旧排好了）
  const groups: { day: string; items: Article[] }[] = [];
  for (const a of page?.items ?? []) {
    const day = dayLabel(a.publishedAt);
    if (groups.at(-1)?.day === day) groups.at(-1)!.items.push(a);
    else groups.push({ day, items: [a] });
  }
  const filtered = topic !== null || unreadOnly || kw !== "";

  return (
    <div>
      <PageHeader
        title="资讯"
        sub="订阅的来源有什么新文章，每次打开自动更新"
        action={
          <div className="flex gap-2">
            <button className="btn bg-ink/8 hover:bg-ink/12" onClick={() => refresh(true)} disabled={refreshing} title="把所有来源重新读一遍">
              <RefreshCw className={`size-4 ${refreshing ? "animate-spin" : ""}`} /> {refreshing ? "更新中…" : "刷新"}
            </button>
            <button className="btn-primary" onClick={() => setManaging(true)}>
              <Rss className="size-4" /> 管理来源
            </button>
          </div>
        }
      />

      {/* AI 简报：按一下，把今天 / 本周 / 本月的文章总结成一份中文简报 */}
      <div className="card mb-5 flex flex-wrap items-center gap-x-3 gap-y-2 !py-3">
        <Sparkles className="size-5 shrink-0 text-brand" strokeWidth={1.6} />
        <div className="min-w-0 flex-1">
          <div className="text-sm font-medium">AI 资讯简报</div>
          <div className="mt-0.5 text-xs text-slate-500">让 AI 把今天、本周或本月的文章总结成一份中文简报，英文内容也用中文讲。</div>
        </div>
        <AiSummaryButton kind="news" label="生成简报" />
      </div>

      <div className="mb-5 space-y-3">
        <div className="flex flex-wrap items-center gap-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="搜索标题和摘要…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索文章" />
          </div>
          <label className="flex cursor-pointer items-center gap-2 text-sm">
            <input type="checkbox" className="size-4" checked={unreadOnly} onChange={(e) => setUnreadOnly(e.target.checked)} />
            只看未读
          </label>
          <div className="ml-auto flex items-center gap-1">
            {untranslated.length > 0 && (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={translate} disabled={aiBusy !== null} title="让 AI 把下面列表里的英文标题翻成中文（标题会发给你配置的 AI 模型）">
                {aiBusy === "translate" ? <RefreshCw className="size-3.5 animate-spin" /> : <Languages className="size-3.5" />}
                {aiBusy === "translate" ? "正在翻译…" : `翻译 ${untranslated.length} 个英文标题`}
              </button>
            )}
            {unreadTotal > 0 && (
              <button className="btn-ghost px-2.5 py-1 text-xs" onClick={readAll}>
                <CheckCheck className="size-3.5" /> 全部已读
              </button>
            )}
          </div>
        </div>
        {topics.length > 1 && (
          <div className="flex flex-wrap gap-2">
            <button className={topic === null ? "chip-on" : "chip"} onClick={() => setTopic(null)}>
              全部{unreadTotal > 0 && ` ${unreadTotal}`}
            </button>
            {topics.map((t) => (
              <button key={t} className={topic === t ? "chip-on" : "chip"} onClick={() => setTopic(topic === t ? null : t)} title={page?.unread[t] ? `${page.unread[t]} 篇未读` : undefined}>
                {topicName(t)}
                {!!page?.unread[t] && ` ${page.unread[t]}`}
              </button>
            ))}
          </div>
        )}
      </div>

      {page === null ? (
        <div className="card h-40 animate-pulse" />
      ) : groups.length === 0 ? (
        <div className="card px-6 py-12 text-center text-sm text-slate-500">
          {refreshing ? (
            "正在读取各个来源的最新文章，第一次大约要十几秒…"
          ) : filtered ? (
            <>
              没有符合条件的文章。
              <button
                className="ml-1 cursor-pointer underline underline-offset-4 hover:text-ink"
                onClick={() => {
                  setQ("");
                  setTopic(null);
                  setUnreadOnly(false);
                }}
              >
                清除筛选
              </button>
            </>
          ) : feeds.some((f) => f.enabled) ? (
            "还没有文章。点右上角的「刷新」读取一次。"
          ) : (
            "还没有启用的来源。点右上角的「管理来源」添加或启用。"
          )}
        </div>
      ) : (
        <div className="space-y-6">
          {groups.map((g) => (
            <section key={g.day}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-medium">
                {g.day}
                <span className="text-xs font-normal text-slate-500">{g.items.length}</span>
              </h2>
              <ul className="card divide-y divide-line !py-1">
                {g.items.map((a) => (
                  <li key={a.id} className="group flex items-start gap-3 py-3">
                    {/* 左边的小圆点：亮着 = 未读，点一下在已读 / 未读之间切换 */}
                    <button
                      className="mt-1.5 grid size-4 shrink-0 cursor-pointer place-items-center rounded-full"
                      onClick={() => setRead(a, !a.read)}
                      title={a.read ? "标为未读" : "标为已读"}
                      aria-label={a.read ? `把「${a.title}」标为未读` : `把「${a.title}」标为已读`}
                    >
                      <span className={`size-2 rounded-full transition ${a.read ? "bg-ink/15 group-hover:bg-ink/30" : "bg-brand"}`} />
                    </button>
                    <div className={`min-w-0 flex-1 ${a.read ? "opacity-55" : ""}`}>
                      <a
                        href={a.url}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-medium leading-snug underline-offset-4 hover:underline"
                        onClick={() => setRead(a, true)}
                        onAuxClick={() => setRead(a, true)} // 鼠标中键在后台打开也算读过
                      >
                        {a.title}
                      </a>
                      {a.titleZh && <p className="mt-0.5 text-sm leading-snug text-slate-600">{a.titleZh}</p>}
                      <div className="mt-1 flex flex-wrap items-center gap-x-2 text-xs text-slate-500">
                        <span>{a.feed}</span>
                        <span aria-hidden>·</span>
                        <time dateTime={a.publishedAt} title={new Date(a.publishedAt).toLocaleString("zh-CN")}>
                          {timeLabel(a.publishedAt)}
                        </time>
                        {topic === null && a.topic && <span className="tag">{a.topic}</span>}
                        {!a.aiSummary && (
                          <button
                            className="inline-flex cursor-pointer items-center gap-1 underline-offset-4 hover:text-ink hover:underline disabled:cursor-default disabled:no-underline md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"
                            onClick={() => summarize(a)}
                            disabled={aiBusy !== null}
                            title="让 AI 读原文并写一段中文摘要（文章内容会发给你配置的 AI 模型）"
                          >
                            {aiBusy === a.id ? <RefreshCw className="size-3 animate-spin" /> : <Sparkles className="size-3" />}
                            {aiBusy === a.id ? "正在读原文…" : "AI 摘要"}
                          </button>
                        )}
                      </div>
                      {a.aiSummary ? (
                        <p className="mt-1.5 rounded-xl bg-brand/10 px-3 py-2 text-sm leading-relaxed">
                          <Sparkles className="mr-1.5 inline size-3.5 -translate-y-px text-brand" aria-label="AI 摘要" />
                          {a.aiSummary}
                        </p>
                      ) : (
                        a.summary && <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-slate-600">{a.summary}</p>
                      )}
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {page.hasMore && (
            <div className="text-center">
              <button className="btn bg-ink/8 hover:bg-ink/12" onClick={loadMore} disabled={loadingMore}>
                {loadingMore ? "加载中…" : "加载更多"}
              </button>
            </div>
          )}
        </div>
      )}

      {managing && (
        <Modal title={draft ? (draft.id ? "编辑来源" : "添加来源") : "管理来源"} onClose={closeManage}>
          {draft ? (
            <form onSubmit={saveFeed} className="space-y-3">
              {draft.id ? (
                <p className="truncate rounded-[10px] bg-ink/6 px-3 py-2 font-mono text-xs text-slate-600" title={draft.url}>
                  {draft.url}
                </p>
              ) : (
                <div>
                  <label className="label" htmlFor="feed-url">
                    地址
                  </label>
                  <input id="feed-url" className="input" value={draft.url} onChange={(e) => setDraft({ ...draft, url: e.target.value })} placeholder="RSS 订阅地址，或者直接填网站地址" autoFocus inputMode="url" spellCheck={false} />
                  <p className="mt-1.5 text-xs text-slate-500">填网站地址的话，会自动去找它的 RSS。不是每个网站都提供 RSS，找不到会告诉你。</p>
                </div>
              )}
              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="label" htmlFor="feed-title">
                    名称
                  </label>
                  <input id="feed-title" className="input" value={draft.title} onChange={(e) => setDraft({ ...draft, title: e.target.value })} placeholder={draft.id ? "" : "不填会用来源自己的名字"} maxLength={40} />
                </div>
                <div>
                  <label className="label" htmlFor="feed-topic">
                    主题
                  </label>
                  <input id="feed-topic" className="input" list="feed-topics" value={draft.topic} onChange={(e) => setDraft({ ...draft, topic: e.target.value })} placeholder="选一个，或输入新的" maxLength={20} />
                  <datalist id="feed-topics">
                    {allTopics.map((t) => (
                      <option key={t} value={t} />
                    ))}
                  </datalist>
                </div>
              </div>
              <ErrorText msg={error} />
              <div className="flex justify-end gap-2 pt-2">
                <button type="button" className="btn-ghost mr-auto" onClick={() => setDraft(null)}>
                  <ArrowLeft className="size-4" /> 返回列表
                </button>
                <button className="btn-primary" disabled={saving}>
                  {saving ? (draft.id ? "保存中…" : "正在读取…") : draft.id ? "保存" : "添加"}
                </button>
              </div>
            </form>
          ) : (
            <>
              <ul className="-mt-2 max-h-[55vh] divide-y divide-line overflow-y-auto pr-1">
                {feeds.map((f) => (
                  <li key={f.id} className="group flex items-center gap-3 py-2.5">
                    <input type="checkbox" className="size-4 shrink-0 cursor-pointer" checked={f.enabled} onChange={() => toggleFeed(f)} title={f.enabled ? "停用这个来源" : "启用这个来源"} aria-label={`启用 ${f.title}`} />
                    <div className={`min-w-0 flex-1 ${f.enabled ? "" : "opacity-50"}`}>
                      <div className="flex items-center gap-2">
                        <span className="truncate text-sm font-medium">{f.title}</span>
                        <span className="tag shrink-0">{topicName(f.topic)}</span>
                      </div>
                      {f.lastError ? (
                        <div className="mt-0.5 flex items-center gap-1 text-xs text-red-600" title={f.lastError}>
                          <CircleAlert className="size-3 shrink-0" />
                          <span className="truncate">上次没读到：{f.lastError}</span>
                        </div>
                      ) : (
                        <div className="mt-0.5 truncate text-xs text-slate-500">
                          {hostOf(f.siteUrl || f.url)} · {f.lastFetchedAt ? `${f.articles} 篇，${timeLabel(f.lastFetchedAt)}更新` : "还没读过"}
                        </div>
                      )}
                    </div>
                    <div className="flex shrink-0 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100">
                      <button
                        className="btn-ghost p-1.5"
                        title="改名称、主题"
                        aria-label={`编辑 ${f.title}`}
                        onClick={() => {
                          setError("");
                          setDraft({ id: f.id, url: f.url, title: f.title, topic: f.topic });
                        }}
                      >
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="btn-danger p-1.5" title="删除" aria-label={`删除 ${f.title}`} onClick={() => removeFeed(f)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
                {feeds.length === 0 && <li className="py-8 text-center text-sm text-slate-500">一个来源都没有了。</li>}
              </ul>
              <div className="mt-4 flex items-center justify-between gap-3">
                <p className="text-xs text-slate-500">
                  取消勾选是停用，文章先不显示。删掉的内置来源可以
                  <button className="cursor-pointer underline underline-offset-4 hover:text-ink" onClick={restoreFeeds}>
                    恢复
                  </button>
                  。
                </p>
                <button
                  className="btn-primary shrink-0"
                  onClick={() => {
                    setError("");
                    setDraft({ url: "", title: "", topic: topic ?? "" });
                  }}
                >
                  <Plus className="size-4" /> 添加来源
                </button>
              </div>
            </>
          )}
        </Modal>
      )}
    </div>
  );
}
