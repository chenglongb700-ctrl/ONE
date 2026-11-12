import { useEffect, useMemo, useRef, useState, type ClipboardEvent, type FormEvent } from "react";
import { Copy, ExternalLink, Folder, Globe, ImagePlus, Link2, LoaderCircle, Pencil, Pin, Plus, Quote, Search, Trash2, type LucideIcon } from "lucide-react";
import { toast } from "sonner";
import { api, uploadFile, type Favorite, type FavoriteKind } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";

const KINDS: Record<FavoriteKind, { label: string; icon: LucideIcon }> = {
  link: { label: "网址", icon: Link2 },
  text: { label: "摘录", icon: Quote },
  image: { label: "图片", icon: ImagePlus },
};

const splitTags = (s: string) =>
  s
    .split(/[,，\s]+/)
    .map((t) => t.trim())
    .filter(Boolean);

/** 用户常常只打 example.com：没写协议就补上 https:// */
const normalizeUrl = (s: string) => {
  const u = s.trim();
  return u && !/^https?:\/\//i.test(u) ? `https://${u}` : u;
};

const hostOf = (url: string) => {
  try {
    return new URL(url).hostname.replace(/^www\./, "");
  } catch {
    return url;
  }
};

/** 网站图标：直接用对方网站的 /favicon.ico，加载不出来就显示一个地球 */
function Favicon({ url }: { url: string }) {
  const [failed, setFailed] = useState(false);
  let src = "";
  try {
    src = new URL(url).origin + "/favicon.ico";
  } catch {
    /* 网址不合法就用默认图标 */
  }
  return (
    <span className="grid size-9 shrink-0 place-items-center rounded-[10px] bg-ink/6 text-slate-500">
      {src && !failed ? <img src={src} alt="" className="size-5 rounded-sm" loading="lazy" onError={() => setFailed(true)} /> : <Globe className="size-[18px]" />}
    </span>
  );
}

type Draft = { kind: FavoriteKind; title: string; url: string; content: string; group: string; tags: string; pinned: boolean };
type Editing = { id?: number; draft: Draft; file?: File; preview?: string };
const emptyDraft = (kind: FavoriteKind, group: string): Draft => ({ kind, title: "", url: "", content: "", group, tags: "", pinned: false });

const UNGROUPED = "\u0000"; // 筛选"未分组"用的内部标记，不会和真实的分组名重复

export default function Favorites() {
  const [list, setList] = useState<Favorite[] | null>(null);
  const [q, setQ] = useState("");
  const [kind, setKind] = useState<FavoriteKind | null>(null);
  const [group, setGroup] = useState<string | null>(null);
  const [tag, setTag] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [viewing, setViewing] = useState<Favorite | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [fetching, setFetching] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.get<Favorite[]>("/favorites").then(setList);
  useEffect(() => {
    load();
  }, []);

  const all = list ?? [];
  const groups = useMemo(() => [...new Set(all.map((f) => f.group).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh")), [all]);
  const hasUngrouped = groups.length > 0 && all.some((f) => !f.group);
  const allTags = useMemo(() => [...new Set(all.flatMap((f) => splitTags(f.tags)))], [all]);

  const kw = q.trim().toLowerCase();
  const shown = all.filter(
    (f) =>
      (!kind || f.kind === kind) &&
      (group === null || (group === UNGROUPED ? !f.group : f.group === group)) &&
      (!tag || splitTags(f.tags).includes(tag)) &&
      (!kw || [f.title, f.url, f.content, f.tags, f.group].some((s) => s.toLowerCase().includes(kw))),
  );

  // ---------- 新建 / 编辑 ----------
  const closeEditor = () => {
    if (editing?.preview) URL.revokeObjectURL(editing.preview);
    setEditing(null);
  };

  const openNew = (k: FavoriteKind = "link") => {
    setError("");
    // 正在看某个分组时，新收藏默认放进这个分组
    setEditing({ draft: emptyDraft(k, group && group !== UNGROUPED ? group : "") });
  };

  const openEdit = (f: Favorite) => {
    setError("");
    setViewing(null);
    setEditing({ id: f.id, draft: { kind: f.kind, title: f.title, url: f.url, content: f.content, group: f.group, tags: f.tags, pinned: f.pinned } });
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const pickImage = (file: File | undefined) => {
    if (!file) return;
    if (!file.type.startsWith("image/")) return setError("请选择一张图片");
    setError("");
    setEditing((e) => {
      if (!e) return e;
      if (e.preview) URL.revokeObjectURL(e.preview);
      return { ...e, file, preview: URL.createObjectURL(file) };
    });
  };

  // 在弹窗里直接 Ctrl+V 粘贴截图
  const onPaste = (e: ClipboardEvent) => {
    if (!editing || editing.id || editing.draft.kind !== "image") return;
    const file = [...e.clipboardData.files].find((f) => f.type.startsWith("image/"));
    if (file) {
      e.preventDefault();
      pickImage(file);
    }
  };

  // 填完网址后自动去抓标题和简介；已经手动填过的不覆盖
  const fillFromUrl = async () => {
    if (!editing || editing.draft.kind !== "link") return;
    const url = normalizeUrl(editing.draft.url);
    if (!url) return;
    if (url !== editing.draft.url) set("url", url);
    if (editing.draft.title.trim()) return;
    setFetching(true);
    try {
      const meta = await api.get<{ title: string; description: string }>(`/favorites/meta?url=${encodeURIComponent(url)}`);
      setEditing((e) =>
        e && normalizeUrl(e.draft.url) === url
          ? { ...e, draft: { ...e.draft, title: e.draft.title.trim() || meta.title, content: e.draft.content.trim() || meta.description } }
          : e,
      );
    } catch {
      /* 网址格式不对之类的，保存时会提示，这里不打扰 */
    } finally {
      setFetching(false);
    }
  };

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const d = editing.draft;
    const body = { ...d, url: normalizeUrl(d.url), tags: splitTags(d.tags).join(","), group: d.group.trim() };
    if (d.kind === "link" && !body.url) return setError("请填写网址");
    if (d.kind === "text" && !d.content.trim()) return setError("请填写摘录的内容");
    if (d.kind === "image" && !editing.id && !editing.file) return setError("请选择一张图片，或者直接粘贴截图");
    setSaving(true);
    try {
      if (editing.id) {
        await api.put(`/favorites/${editing.id}`, body);
      } else if (d.kind === "image") {
        const form = new FormData();
        form.append("file", editing.file!);
        for (const k of ["title", "url", "content", "group", "tags"] as const) form.append(k, body[k]);
        form.append("pinned", String(body.pinned));
        await uploadFile<Favorite>("/favorites/image", form);
      } else {
        await api.post("/favorites", body);
      }
      toast.success(editing.id ? "已保存修改" : "已收藏");
      closeEditor();
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- 列表上的操作 ----------
  const togglePin = async (f: Favorite) => {
    try {
      await api.put(`/favorites/${f.id}`, { pinned: !f.pinned });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (f: Favorite) => {
    const name = f.title || (f.kind === "text" ? f.content.slice(0, 20) : KINDS[f.kind].label);
    if (!(await confirmDialog({ title: "删除这条收藏？", message: `「${name}」删除后无法恢复。` }))) return;
    try {
      await api.del(`/favorites/${f.id}`);
      toast.success("已删除");
      setViewing(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success("已复制");
    } catch {
      toast.error("复制失败，请手动选中文字复制");
    }
  };

  const count = (pred: (f: Favorite) => boolean) => all.filter(pred).length;
  const filtered = kind !== null || group !== null || tag !== null || kw !== "";

  return (
    <div>
      <PageHeader
        title="收藏"
        sub="好网站、好句子、好图，先收着"
        action={
          <button className="btn-primary" onClick={() => openNew(kind ?? "link")}>
            <Plus className="size-4" /> 添加收藏
          </button>
        }
      />

      {list !== null && all.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="flex flex-wrap items-center gap-3">
            <div className="relative w-full max-w-xs">
              <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
              <input className="input pl-9" placeholder="搜索标题、网址、内容、标签…" value={q} onChange={(e) => setQ(e.target.value)} />
            </div>
            <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="收藏的种类">
              {([null, "link", "text", "image"] as const).map((k) => (
                <button
                  key={k ?? "all"}
                  role="radio"
                  aria-checked={kind === k}
                  onClick={() => setKind(k)}
                  className={`cursor-pointer rounded-lg px-3 py-1 transition ${kind === k ? "bg-surface shadow-sm" : "text-slate-600 hover:text-ink"}`}
                >
                  {k ? KINDS[k].label : "全部"}
                </button>
              ))}
            </div>
          </div>

          {groups.length > 0 && (
            <div className="flex flex-wrap items-center gap-2">
              <Folder className="size-4 text-slate-400" aria-label="分组" />
              <button className={group === null ? "chip-on" : "chip"} onClick={() => setGroup(null)}>
                全部 {all.length}
              </button>
              {groups.map((g) => (
                <button key={g} className={group === g ? "chip-on" : "chip"} onClick={() => setGroup(group === g ? null : g)}>
                  {g} {count((f) => f.group === g)}
                </button>
              ))}
              {hasUngrouped && (
                <button className={group === UNGROUPED ? "chip-on" : "chip"} onClick={() => setGroup(group === UNGROUPED ? null : UNGROUPED)}>
                  未分组 {count((f) => !f.group)}
                </button>
              )}
            </div>
          )}

          {allTags.length > 0 && (
            <div className="flex flex-wrap gap-2">
              {allTags.map((t) => (
                <button key={t} onClick={() => setTag(tag === t ? null : t)} className={tag === t ? "chip-on" : "chip"}>
                  #{t}
                </button>
              ))}
            </div>
          )}
        </div>
      )}

      {list === null ? (
        <div className="card h-40 animate-pulse" />
      ) : all.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm text-slate-500">还没有收藏。可以收三种东西：</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            {(Object.keys(KINDS) as FavoriteKind[]).map((k) => {
              const K = KINDS[k];
              return (
                <button key={k} className="btn bg-ink/6 hover:bg-ink/10" onClick={() => openNew(k)}>
                  <K.icon className="size-4" /> 收藏{K.label}
                </button>
              );
            })}
          </div>
        </div>
      ) : shown.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          没有符合条件的收藏。
          {filtered && (
            <button
              className="ml-1 cursor-pointer underline underline-offset-4 hover:text-ink"
              onClick={() => {
                setQ("");
                setKind(null);
                setGroup(null);
                setTag(null);
              }}
            >
              清除筛选
            </button>
          )}
        </div>
      ) : (
        // 三种卡片高度不一样，用多栏排版让它们像瀑布流一样上下紧挨着
        <div className="columns-1 gap-4 sm:columns-2 xl:columns-3">
          {shown.map((f) => (
            <article key={f.id} className="card group mb-4 break-inside-avoid">
              {f.kind === "link" && (
                <>
                  <a href={f.url} target="_blank" rel="noreferrer noopener" className="flex items-start gap-3" title={f.url}>
                    <Favicon url={f.url} />
                    <span className="min-w-0 flex-1">
                      <span className="line-clamp-2 font-medium leading-snug underline-offset-4 group-hover:underline">{f.title || hostOf(f.url)}</span>
                      <span className="mt-0.5 flex items-center gap-1 text-xs text-slate-500">
                        <span className="truncate">{hostOf(f.url)}</span>
                        <ExternalLink className="size-3 shrink-0" />
                      </span>
                    </span>
                  </a>
                  {f.content && <p className="mt-2.5 line-clamp-3 text-sm text-slate-600">{f.content}</p>}
                </>
              )}

              {f.kind === "text" && (
                <>
                  <button className="block w-full cursor-pointer text-left" onClick={() => setViewing(f)} title="查看全文">
                    <blockquote className="line-clamp-[9] whitespace-pre-wrap border-l-2 border-brand/50 pl-3 text-sm leading-relaxed">{f.content}</blockquote>
                  </button>
                  {(f.title || f.url) && (
                    <p className="mt-2.5 truncate text-xs text-slate-500">
                      出自{" "}
                      {f.url ? (
                        <a href={f.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
                          {f.title || hostOf(f.url)}
                        </a>
                      ) : (
                        f.title
                      )}
                    </p>
                  )}
                </>
              )}

              {f.kind === "image" && f.image && (
                <>
                  <button className="block w-full cursor-zoom-in" onClick={() => setViewing(f)} title="查看大图">
                    <img src={f.image} alt={f.title} loading="lazy" className="max-h-96 w-full rounded-[10px] bg-ink/6 object-cover" />
                  </button>
                  {f.title && <h3 className="mt-2.5 truncate text-sm font-medium">{f.title}</h3>}
                  {f.content && <p className="mt-1 line-clamp-2 text-sm text-slate-600">{f.content}</p>}
                </>
              )}

              <div className="mt-3 flex items-center gap-1">
                <div className="flex min-w-0 flex-1 flex-wrap gap-1">
                  {f.group && (
                    <button className="tag flex cursor-pointer items-center gap-1 hover:text-ink" onClick={() => setGroup(f.group)} title="只看这个分组">
                      <Folder className="size-3" />
                      {f.group}
                    </button>
                  )}
                  {splitTags(f.tags).map((t) => (
                    <button key={t} className="tag cursor-pointer hover:text-ink" onClick={() => setTag(t)} title="只看这个标签">
                      #{t}
                    </button>
                  ))}
                </div>
                <div className={`flex shrink-0 ${f.pinned ? "" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}>
                  {f.kind === "text" && (
                    <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="复制" aria-label="复制摘录" onClick={() => copy(f.content)}>
                      <Copy className="size-3.5" />
                    </button>
                  )}
                  <button
                    className={`btn-ghost p-1.5 ${f.pinned ? "text-brand" : ""}`}
                    title={f.pinned ? "取消置顶" : "置顶"}
                    aria-label={f.pinned ? "取消置顶" : "置顶"}
                    aria-pressed={f.pinned}
                    onClick={() => togglePin(f)}
                  >
                    {/* 图钉实心 = 已置顶 */}
                    <Pin className={`size-3.5 ${f.pinned ? "fill-current" : ""}`} />
                  </button>
                  <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="编辑" aria-label="编辑" onClick={() => openEdit(f)}>
                    <Pencil className="size-3.5" />
                  </button>
                  <button className="btn-danger p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="删除" aria-label="删除" onClick={() => remove(f)}>
                    <Trash2 className="size-3.5" />
                  </button>
                </div>
              </div>
            </article>
          ))}
        </div>
      )}

      {viewing && (
        <Modal title={viewing.title || KINDS[viewing.kind].label} onClose={() => setViewing(null)}>
          {viewing.kind === "image" && viewing.image ? (
            <img src={viewing.image} alt={viewing.title} className="max-h-[65vh] w-full rounded-[10px] bg-ink/6 object-contain" />
          ) : (
            <div className="max-h-[60vh] overflow-y-auto whitespace-pre-wrap text-sm leading-relaxed">{viewing.content}</div>
          )}
          {viewing.kind === "image" && viewing.content && <p className="mt-3 text-sm text-slate-600">{viewing.content}</p>}
          {viewing.url && (
            <p className="mt-3 truncate text-xs text-slate-500">
              出自{" "}
              <a href={viewing.url} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
                {hostOf(viewing.url)}
              </a>
            </p>
          )}
          <div className="mt-4 flex justify-end gap-2">
            {viewing.kind === "text" && (
              <button className="btn-ghost mr-auto" onClick={() => copy(viewing.content)}>
                <Copy className="size-4" /> 复制
              </button>
            )}
            <button className="btn-danger" onClick={() => remove(viewing)}>
              <Trash2 className="size-4" /> 删除
            </button>
            <button className="btn-primary" onClick={() => openEdit(viewing)}>
              <Pencil className="size-4" /> 编辑
            </button>
          </div>
        </Modal>
      )}

      {editing && (
        <Modal title={editing.id ? `编辑${KINDS[editing.draft.kind].label}` : "添加收藏"} onClose={closeEditor}>
          <form onSubmit={save} onPaste={onPaste} className="space-y-3">
            {/* 种类只能在新建时选；已有的收藏不能从网址变成图片 */}
            {!editing.id && (
              <div className="flex rounded-xl bg-ink/6 p-1 text-sm" role="radiogroup" aria-label="收藏的种类">
                {(Object.keys(KINDS) as FavoriteKind[]).map((k) => {
                  const K = KINDS[k];
                  return (
                    <button
                      type="button"
                      key={k}
                      role="radio"
                      aria-checked={editing.draft.kind === k}
                      onClick={() => {
                        setError("");
                        set("kind", k);
                      }}
                      className={`flex flex-1 cursor-pointer items-center justify-center gap-1.5 rounded-lg py-1.5 transition ${editing.draft.kind === k ? "bg-surface shadow-sm" : "text-slate-500 hover:text-ink"}`}
                    >
                      <K.icon className="size-4" /> {K.label}
                    </button>
                  );
                })}
              </div>
            )}

            {editing.draft.kind === "link" && (
              <div>
                <label className="label" htmlFor="fav-url">
                  网址
                </label>
                <input id="fav-url" className="input" value={editing.draft.url} onChange={(e) => set("url", e.target.value)} onBlur={fillFromUrl} placeholder="https://" autoFocus={!editing.id} inputMode="url" />
              </div>
            )}

            {editing.draft.kind === "text" && (
              <div>
                <label className="label" htmlFor="fav-content">
                  摘录的内容
                </label>
                <textarea id="fav-content" className="input min-h-36" value={editing.draft.content} onChange={(e) => set("content", e.target.value)} placeholder="一段话、一句诗、一段代码…" autoFocus={!editing.id} />
              </div>
            )}

            {editing.draft.kind === "image" && !editing.id && (
              <div>
                <span className="label">图片</span>
                <button
                  type="button"
                  onClick={() => fileRef.current?.click()}
                  className="grid w-full cursor-pointer place-items-center rounded-[10px] border border-dashed border-ink/20 bg-ink/[0.025] p-3 text-sm text-slate-500 transition hover:border-brand/60 hover:text-ink"
                >
                  {editing.preview ? (
                    <img src={editing.preview} alt="待上传的图片" className="max-h-52 rounded-lg object-contain" />
                  ) : (
                    <span className="flex flex-col items-center gap-1.5 py-6">
                      <ImagePlus className="size-6" />
                      点击选择图片，或者直接按 Ctrl+V 粘贴截图
                    </span>
                  )}
                </button>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif" hidden onChange={(e) => pickImage(e.target.files?.[0])} />
              </div>
            )}

            <div>
              <label className="label flex items-center gap-1.5" htmlFor="fav-title">
                {editing.draft.kind === "text" ? "出处（书名、作者、文章名，可不填）" : "标题"}
                {fetching && (
                  <span className="flex items-center gap-1 font-normal text-slate-400">
                    <LoaderCircle className="size-3 animate-spin" /> 正在获取网页标题…
                  </span>
                )}
              </label>
              <input
                id="fav-title"
                className="input"
                value={editing.draft.title}
                onChange={(e) => set("title", e.target.value)}
                placeholder={editing.draft.kind === "link" ? "不填会自动用网页标题" : editing.draft.kind === "image" ? "不填会用文件名" : ""}
              />
            </div>

            {editing.draft.kind !== "link" && (
              <div>
                <label className="label" htmlFor="fav-source">
                  来源网址（可不填）
                </label>
                <input id="fav-source" className="input" value={editing.draft.url} onChange={(e) => set("url", e.target.value)} placeholder="https://" inputMode="url" />
              </div>
            )}

            {editing.draft.kind !== "text" && (
              <div>
                <label className="label" htmlFor="fav-note">
                  备注
                </label>
                <textarea id="fav-note" className="input min-h-16" value={editing.draft.content} onChange={(e) => set("content", e.target.value)} placeholder="为什么收藏它，之后想拿它做什么" />
              </div>
            )}

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="fav-group">
                  分组
                </label>
                <input id="fav-group" className="input" list="fav-groups" value={editing.draft.group} onChange={(e) => set("group", e.target.value)} placeholder="选一个，或输入新的" />
                <datalist id="fav-groups">
                  {groups.map((g) => (
                    <option key={g} value={g} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="fav-tags">
                  标签（逗号或空格分隔）
                </label>
                <input id="fav-tags" className="input" value={editing.draft.tags} onChange={(e) => set("tags", e.target.value)} placeholder="设计, 灵感" />
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={editing.draft.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              置顶
            </label>

            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={closeEditor}>
                取消
              </button>
              <button className="btn-primary" disabled={saving}>
                {saving ? "保存中…" : editing.id ? "保存" : "收藏"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
