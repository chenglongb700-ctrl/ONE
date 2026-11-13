import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { ImageUp, Pencil, Pin, Plus, RefreshCw, Search, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, uploadFile, type Site } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { hostOf, normalizeUrl } from "../url";

const UNSORTED = "\u0000"; // 筛选"未分类"用的内部标记，不会和真实的分类名重复

/**
 * 网站的 logo。统一放在一块白色的小底板上：很多 logo 是按白底设计的，透明底的深色图标直接放在深色玻璃上会看不见。
 * 取回来的图有大有小：够大的（比如 180×180 的应用图标）铺满底板，小的 favicon 留一圈白边，不硬拉大。
 * 没有图标或者加载失败时，用名称的第一个字。
 */
function SiteLogo({ site, className = "size-12 text-xl" }: { site: Pick<Site, "title" | "url" | "icon">; className?: string }) {
  const [failed, setFailed] = useState<string | null>(null);
  const [big, setBig] = useState(false);
  const letter = [...(site.title || hostOf(site.url)).trim()][0]?.toUpperCase() ?? "?";
  const showImage = site.icon && failed !== site.icon;
  return (
    <span className={`grid shrink-0 place-items-center overflow-hidden rounded-[14px] shadow-sm ring-1 ring-black/5 ${showImage ? "bg-white" : "bg-brand/20 font-medium text-brand"} ${className}`}>
      {showImage ? (
        <img
          key={site.icon}
          src={site.icon!}
          alt=""
          loading="lazy"
          className={big ? "size-full object-cover" : "size-[62%] object-contain"}
          onLoad={(e) => setBig(e.currentTarget.naturalWidth >= 96)}
          onError={() => setFailed(site.icon)}
        />
      ) : (
        letter
      )}
    </span>
  );
}

type Draft = { url: string; title: string; category: string; pinned: boolean };
type Editing = { site?: Site; draft: Draft };

export default function Sites() {
  const [list, setList] = useState<Site[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const [iconBusy, setIconBusy] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  const load = () => api.get<Site[]>("/sites").then(setList);
  useEffect(() => {
    load();
  }, []);

  const all = list ?? [];
  const categories = useMemo(() => [...new Set(all.map((s) => s.category).filter(Boolean))].sort((a, b) => a.localeCompare(b, "zh")), [all]);
  const hasUnsorted = categories.length > 0 && all.some((s) => !s.category);

  const kw = q.trim().toLowerCase();
  const matches = (s: Site) => !kw || [s.title, s.url, s.category].some((t) => t.toLowerCase().includes(kw));

  // 要显示的各个区块。看"全部"时置顶的单独排在最上面，下面各分类里就不再重复；
  // 只看某一个分类时，这个分类的全都列出来（置顶的在前）。
  const sections: { title: string; items: Site[] }[] = [];
  if (cat === null) {
    const pinned = all.filter((s) => s.pinned && matches(s));
    if (pinned.length) sections.push({ title: "置顶", items: pinned });
    for (const name of [...categories, ""]) {
      const items = all.filter((s) => !s.pinned && s.category === name && matches(s));
      if (items.length) sections.push({ title: name || (categories.length ? "未分类" : "全部网址"), items });
    }
  } else {
    const items = all.filter((s) => (cat === UNSORTED ? !s.category : s.category === cat) && matches(s));
    if (items.length) sections.push({ title: cat === UNSORTED ? "未分类" : cat, items });
  }

  // ---------- 新建 / 编辑 ----------
  const openNew = () => {
    setError("");
    setEditing({ draft: { url: "", title: "", category: cat && cat !== UNSORTED ? cat : "", pinned: false } });
  };

  const openEdit = (s: Site) => {
    setError("");
    setEditing({ site: s, draft: { url: s.url, title: s.title, category: s.category, pinned: s.pinned } });
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    const body = { ...editing.draft, url: normalizeUrl(editing.draft.url), title: editing.draft.title.trim(), category: editing.draft.category.trim() };
    if (!body.url) return setError("请填写网址");
    setSaving(true);
    try {
      if (editing.site) {
        await api.put(`/sites/${editing.site.id}`, body);
        toast.success("已保存修改");
      } else {
        const created = await api.post<Site>("/sites", body);
        if (created.icon) toast.success(`已添加 ${created.title}`);
        else toast.message(`已添加 ${created.title}`, { description: "没能取到这个网站的图标，先用文字代替；可以在编辑里自己上传一张。" });
      }
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // 编辑弹窗里换图标：换完立刻更新弹窗里的预览和后面的列表
  const applyIcon = (updated: Site) => {
    setEditing((e) => (e?.site?.id === updated.id ? { ...e, site: updated } : e));
    load();
  };

  const refreshIcon = async () => {
    if (!editing?.site) return;
    setError("");
    setIconBusy(true);
    try {
      applyIcon(await api.post<Site>(`/sites/${editing.site.id}/icon/refresh`));
      toast.success("图标已更新");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIconBusy(false);
    }
  };

  const uploadIcon = async (file: File | undefined) => {
    if (fileRef.current) fileRef.current.value = ""; // 清空，这样下次选同一张图也会触发
    if (!file || !editing?.site) return;
    setError("");
    setIconBusy(true);
    try {
      const form = new FormData();
      form.append("file", file);
      applyIcon(await uploadFile<Site>(`/sites/${editing.site.id}/icon`, form));
      toast.success("图标已更换");
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setIconBusy(false);
    }
  };

  // ---------- 列表上的操作 ----------
  const togglePin = async (s: Site) => {
    try {
      await api.put(`/sites/${s.id}`, { pinned: !s.pinned });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (s: Site) => {
    if (!(await confirmDialog({ title: "删除这个网址？", message: `「${s.title}」会从导航里移除。` }))) return;
    try {
      await api.del(`/sites/${s.id}`);
      toast.success("已删除");
      setEditing(null);
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const hoverOnly = "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100";

  return (
    <div>
      <PageHeader
        title="网址"
        sub="常去的网站放这里，点一下就打开"
        action={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="size-4" /> 添加网址
          </button>
        }
      />

      {list !== null && all.length > 0 && (
        <div className="mb-5 flex flex-wrap items-center gap-x-3 gap-y-3">
          <div className="relative w-full max-w-xs">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input className="input pl-9" placeholder="搜索名称、网址、分类…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索网址" />
          </div>
          {categories.length > 0 && (
            <div className="flex flex-wrap gap-2">
              <button className={cat === null ? "chip-on" : "chip"} onClick={() => setCat(null)}>
                全部 {all.length}
              </button>
              {categories.map((name) => (
                <button key={name} className={cat === name ? "chip-on" : "chip"} onClick={() => setCat(cat === name ? null : name)}>
                  {name} {all.filter((s) => s.category === name).length}
                </button>
              ))}
              {hasUnsorted && (
                <button className={cat === UNSORTED ? "chip-on" : "chip"} onClick={() => setCat(cat === UNSORTED ? null : UNSORTED)}>
                  未分类 {all.filter((s) => !s.category).length}
                </button>
              )}
            </div>
          )}
        </div>
      )}

      {list === null ? (
        <div className="card h-40 animate-pulse" />
      ) : all.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm text-slate-500">还没有网址。把每天都要打开的网站加进来，图标会自动取回来。</p>
          <button className="btn-primary mt-4" onClick={openNew}>
            <Plus className="size-4" /> 添加第一个网址
          </button>
        </div>
      ) : sections.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          没有符合条件的网址。
          <button
            className="ml-1 cursor-pointer underline underline-offset-4 hover:text-ink"
            onClick={() => {
              setQ("");
              setCat(null);
            }}
          >
            清除筛选
          </button>
        </div>
      ) : (
        <div className="space-y-7">
          {sections.map((sec) => (
            <section key={sec.title}>
              <h2 className="mb-2.5 flex items-baseline gap-2 px-1 text-sm font-medium">
                {sec.title}
                <span className="text-xs font-normal text-slate-500">{sec.items.length}</span>
              </h2>
              <ul className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-5">
                {sec.items.map((s) => (
                  <li key={s.id} className="card card-link group relative !p-0">
                    <a href={s.url} target="_blank" rel="noreferrer noopener" title={s.url} className="flex flex-col items-center gap-2.5 rounded-[20px] px-3 pb-4 pt-6 text-center">
                      <SiteLogo site={s} />
                      <span className="w-full min-w-0">
                        <span className="block truncate text-sm font-medium">{s.title}</span>
                        <span className="mt-0.5 block truncate text-xs text-slate-500">{hostOf(s.url)}</span>
                      </span>
                    </a>
                    {/* 置顶的图钉一直亮着；其余按钮电脑上悬停才出现，手机上一直显示。删除在编辑里 */}
                    <div className="absolute right-1.5 top-1.5 flex">
                      <button
                        className={`btn-ghost p-1.5 ${s.pinned ? "text-brand" : hoverOnly}`}
                        title={s.pinned ? "取消置顶" : "置顶"}
                        aria-label={s.pinned ? `取消置顶 ${s.title}` : `置顶 ${s.title}`}
                        aria-pressed={s.pinned}
                        onClick={() => togglePin(s)}
                      >
                        <Pin className={`size-3.5 ${s.pinned ? "fill-current" : ""}`} />
                      </button>
                      <button className={`btn-ghost p-1.5 ${hoverOnly}`} title="编辑" aria-label={`编辑 ${s.title}`} onClick={() => openEdit(s)}>
                        <Pencil className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {editing && (
        <Modal title={editing.site ? "编辑网址" : "添加网址"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            {editing.site && (
              <div className="flex items-center gap-4 pb-1">
                <SiteLogo site={editing.site} className="size-14 text-2xl" />
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap gap-2">
                    <button type="button" className="btn bg-ink/8 px-2.5 py-1 text-xs hover:bg-ink/12" disabled={iconBusy} onClick={refreshIcon}>
                      <RefreshCw className={`size-3.5 ${iconBusy ? "animate-spin" : ""}`} /> 重新获取图标
                    </button>
                    <button type="button" className="btn bg-ink/8 px-2.5 py-1 text-xs hover:bg-ink/12" disabled={iconBusy} onClick={() => fileRef.current?.click()}>
                      <ImageUp className="size-3.5" /> 上传图标
                    </button>
                  </div>
                  <div className="mt-1.5 text-xs text-slate-500">图标是添加时自动从网站取回来的。不满意可以自己传一张，方形的效果最好。</div>
                </div>
                <input ref={fileRef} type="file" accept="image/png,image/jpeg,image/webp,image/gif,image/x-icon,.ico" hidden onChange={(e) => uploadIcon(e.target.files?.[0])} />
              </div>
            )}

            <div>
              <label className="label" htmlFor="site-url">
                网址
              </label>
              <input id="site-url" className="input" value={editing.draft.url} onChange={(e) => set("url", e.target.value)} placeholder="github.com" autoFocus={!editing.site} inputMode="url" spellCheck={false} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="site-title">
                  名称
                </label>
                <input id="site-title" className="input" value={editing.draft.title} onChange={(e) => set("title", e.target.value)} placeholder="不填会自动用网站名" maxLength={60} />
              </div>
              <div>
                <label className="label" htmlFor="site-cat">
                  分类
                </label>
                <input id="site-cat" className="input" list="site-cats" value={editing.draft.category} onChange={(e) => set("category", e.target.value)} placeholder="选一个，或输入新的" maxLength={20} />
                <datalist id="site-cats">
                  {categories.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={editing.draft.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              置顶
            </label>

            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              {editing.site && (
                <button type="button" className="btn-danger mr-auto" onClick={() => remove(editing.site!)}>
                  <Trash2 className="size-4" /> 删除
                </button>
              )}
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn-primary" disabled={saving}>
                {saving ? (editing.site ? "保存中…" : "正在获取图标…") : editing.site ? "保存" : "添加"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
