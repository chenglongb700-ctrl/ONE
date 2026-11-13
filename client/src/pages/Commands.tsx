import { useEffect, useMemo, useRef, useState, type FormEvent } from "react";
import { Pencil, Plus, Search, Star, Trash2 } from "lucide-react";
import { toast } from "sonner";
import { api, type Command } from "../api";
import Modal, { ErrorText, PageHeader } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";

const DOCS_URL = "https://code.claude.com/docs/en/commands";
const PINNED = "\u0000"; // 筛选"常用"用的内部标记，不会和真实的分类名重复

type Draft = Omit<Command, "id" | "builtin">;
type Editing = { id?: number; draft: Draft };
const emptyDraft = (category: string): Draft => ({ name: "/", args: "", aliases: "", category, description: "", example: "", note: "", pinned: false });

const copy = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(`已复制 ${text}`);
  } catch {
    toast.error("复制失败，请手动选中文字复制");
  }
};

export default function Commands() {
  const [list, setList] = useState<Command[] | null>(null);
  const [q, setQ] = useState("");
  const [cat, setCat] = useState<string | null>(null);
  const [editing, setEditing] = useState<Editing | null>(null);
  const [error, setError] = useState("");
  const [saving, setSaving] = useState(false);
  const searchRef = useRef<HTMLInputElement>(null);

  const load = () => api.get<Command[]>("/commands").then(setList);
  useEffect(() => {
    load();
  }, []);

  // 按 / 直接跳到搜索框（正在别的输入框里打字时不抢）
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      const el = e.target as HTMLElement;
      if (e.key !== "/" || e.ctrlKey || e.metaKey || e.altKey || el.closest("input, textarea, select, [contenteditable], [role=dialog]")) return;
      e.preventDefault();
      searchRef.current?.focus();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  const all = list ?? [];
  // 分类按第一次出现的顺序排：内置的几类在前，自己新建的分类在后
  const categories = useMemo(() => [...new Set(all.map((c) => c.category))], [all]);
  const pinnedCount = all.filter((c) => c.pinned).length;

  const kw = q.trim().toLowerCase();
  const matches = (c: Command) => !kw || [c.name, c.args, c.aliases, c.description, c.example, c.note, c.category].some((s) => s.toLowerCase().includes(kw));

  // 要显示的各个区块。没有筛选时，常用的命令在最上面单独再列一遍，方便一眼找到
  const sections: { title: string; items: Command[] }[] = [];
  if (cat === PINNED || cat === null) {
    const items = all.filter((c) => c.pinned && matches(c));
    if (items.length) sections.push({ title: "常用", items });
  }
  if (cat !== PINNED) {
    for (const name of categories) {
      if (cat !== null && cat !== name) continue;
      const items = all.filter((c) => c.category === name && matches(c));
      if (items.length) sections.push({ title: name, items });
    }
  }

  // ---------- 新建 / 编辑 ----------
  const openNew = () => {
    setError("");
    setEditing({ draft: emptyDraft(cat && cat !== PINNED ? cat : "") });
  };

  const openEdit = (c: Command) => {
    setError("");
    const { id, builtin: _builtin, ...draft } = c;
    setEditing({ id, draft });
  };

  const set = <K extends keyof Draft>(k: K, v: Draft[K]) => setEditing((e) => (e ? { ...e, draft: { ...e.draft, [k]: v } } : e));

  const save = async (e: FormEvent) => {
    e.preventDefault();
    if (!editing) return;
    setError("");
    if (editing.draft.name.trim().replace(/^\//, "") === "") return setError("请填写命令名，比如 /compact");
    setSaving(true);
    try {
      if (editing.id) await api.put(`/commands/${editing.id}`, editing.draft);
      else await api.post("/commands", editing.draft);
      toast.success(editing.id ? "已保存修改" : "已添加");
      setEditing(null);
      load();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setSaving(false);
    }
  };

  // ---------- 列表上的操作 ----------
  const togglePin = async (c: Command) => {
    try {
      await api.put(`/commands/${c.id}`, { pinned: !c.pinned });
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  const remove = async (c: Command) => {
    const message = c.builtin ? `「${c.name}」是内置命令，删掉后可以在页面底部点"恢复内置命令"补回来，但你写的备注不会回来。` : `「${c.name}」删除后无法恢复。`;
    if (!(await confirmDialog({ title: "删除这条命令？", message }))) return;
    try {
      await api.del(`/commands/${c.id}`);
      toast.success("已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    load();
  };

  const restore = async () => {
    try {
      const { added } = await api.post<{ added: number }>("/commands/restore");
      toast.success(added ? `补回了 ${added} 条内置命令` : "内置命令都在，没有需要补的");
      load();
    } catch (err) {
      toast.error((err as Error).message);
    }
  };

  return (
    <div>
      <PageHeader
        title="命令"
        sub="Claude Code 的斜杠命令，点命令名就能复制"
        action={
          <button className="btn-primary" onClick={openNew}>
            <Plus className="size-4" /> 添加命令
          </button>
        }
      />

      {list !== null && all.length > 0 && (
        <div className="mb-5 space-y-3">
          <div className="relative w-full max-w-sm">
            <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-slate-400" />
            <input ref={searchRef} className="input pl-9 pr-9" placeholder="搜索命令、说明、别名、备注…" value={q} onChange={(e) => setQ(e.target.value)} aria-label="搜索命令" />
            <kbd className="pointer-events-none absolute right-3 top-1/2 hidden -translate-y-1/2 rounded-md bg-ink/8 px-1.5 font-mono text-xs text-slate-500 md:block" title="按 / 键直接搜索">
              /
            </kbd>
          </div>
          <div className="flex flex-wrap gap-2">
            <button className={cat === null ? "chip-on" : "chip"} onClick={() => setCat(null)}>
              全部 {all.length}
            </button>
            {pinnedCount > 0 && (
              <button className={cat === PINNED ? "chip-on" : "chip"} onClick={() => setCat(cat === PINNED ? null : PINNED)}>
                <Star className="mr-1 inline size-3 -translate-y-px fill-current" />
                常用 {pinnedCount}
              </button>
            )}
            {categories.map((name) => (
              <button key={name} className={cat === name ? "chip-on" : "chip"} onClick={() => setCat(cat === name ? null : name)}>
                {name} {all.filter((c) => c.category === name).length}
              </button>
            ))}
          </div>
        </div>
      )}

      {list === null ? (
        <div className="card h-40 animate-pulse" />
      ) : all.length === 0 ? (
        <div className="card px-6 py-12 text-center">
          <p className="text-sm text-slate-500">列表是空的。可以把内置的 Claude Code 命令补回来，或者添加自己的命令。</p>
          <div className="mt-4 flex flex-wrap justify-center gap-2">
            <button className="btn bg-ink/6 hover:bg-ink/10" onClick={restore}>
              恢复内置命令
            </button>
            <button className="btn-primary" onClick={openNew}>
              <Plus className="size-4" /> 添加命令
            </button>
          </div>
        </div>
      ) : sections.length === 0 ? (
        <div className="card py-12 text-center text-sm text-slate-400">
          没有符合条件的命令。
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
        <div className="space-y-6">
          {sections.map((s) => (
            <section key={s.title}>
              <h2 className="mb-2 flex items-baseline gap-2 px-1 text-sm font-medium">
                {s.title}
                <span className="text-xs font-normal text-slate-500">{s.items.length}</span>
              </h2>
              <ul className="card divide-y divide-line !py-1">
                {s.items.map((c) => (
                  <li key={c.id} className="group flex items-start gap-2 py-3">
                    <div className="min-w-0 flex-1 md:grid md:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] md:gap-5">
                      <div className="font-mono text-[13px] leading-6">
                        <button className="cursor-pointer rounded font-semibold text-brand underline-offset-4 hover:underline" onClick={() => copy(c.name)} title="点击复制">
                          {c.name}
                        </button>
                        {c.args && <span className="ml-1.5 break-words text-slate-500">{c.args}</span>}
                      </div>
                      <div className="mt-1 min-w-0 md:mt-0">
                        {c.description && <p className="text-sm leading-6">{c.description}</p>}
                        {c.aliases && <p className="mt-0.5 text-xs text-slate-500">别名 <span className="font-mono">{c.aliases}</span></p>}
                        {c.example && (
                          <button
                            className="mt-1.5 block max-w-full cursor-pointer truncate rounded-md bg-ink/6 px-2 py-1 text-left font-mono text-xs text-slate-700 transition hover:bg-ink/10"
                            onClick={() => copy(c.example)}
                            title="点击复制这个例子"
                          >
                            <span className="mr-1.5 font-sans text-slate-500">例</span>
                            {c.example}
                          </button>
                        )}
                        {c.note && <p className="mt-2 whitespace-pre-wrap border-l-2 border-brand/50 pl-2.5 text-xs leading-relaxed text-slate-600">{c.note}</p>}
                      </div>
                    </div>
                    <div className="flex shrink-0">
                      <button
                        className={`btn-ghost p-1.5 ${c.pinned ? "text-brand" : "md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100"}`}
                        title={c.pinned ? "取消常用" : "标为常用"}
                        aria-label={c.pinned ? `取消常用 ${c.name}` : `把 ${c.name} 标为常用`}
                        aria-pressed={c.pinned}
                        onClick={() => togglePin(c)}
                      >
                        {/* 星星实心 = 常用 */}
                        <Star className={`size-3.5 ${c.pinned ? "fill-current" : ""}`} />
                      </button>
                      <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="编辑、写备注" aria-label={`编辑 ${c.name}`} onClick={() => openEdit(c)}>
                        <Pencil className="size-3.5" />
                      </button>
                      <button className="btn-danger p-1.5 md:opacity-0 md:group-hover:opacity-100 md:group-focus-within:opacity-100" title="删除" aria-label={`删除 ${c.name}`} onClick={() => remove(c)}>
                        <Trash2 className="size-3.5" />
                      </button>
                    </div>
                  </li>
                ))}
              </ul>
            </section>
          ))}
        </div>
      )}

      {list !== null && all.length > 0 && (
        <p className="mt-6 px-1 text-xs leading-relaxed text-slate-500">
          内置命令整理自{" "}
          <a href={DOCS_URL} target="_blank" rel="noreferrer noopener" className="underline underline-offset-4 hover:text-ink">
            Claude Code 官方文档
          </a>
          （2026 年 11 月）。不是每条命令在每个地方都能用，取决于平台（终端、桌面应用、网页）、套餐和版本；在输入框里打 / 能看到当前可用的。 删掉的内置命令可以
          <button className="cursor-pointer underline underline-offset-4 hover:text-ink" onClick={restore}>
            恢复
          </button>
          。
        </p>
      )}

      {editing && (
        <Modal title={editing.id ? "编辑命令" : "添加命令"} onClose={() => setEditing(null)}>
          <form onSubmit={save} className="space-y-3">
            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cmd-name">
                  命令
                </label>
                <input id="cmd-name" className="input font-mono" value={editing.draft.name} onChange={(e) => set("name", e.target.value)} placeholder="/my-command" autoFocus={!editing.id} spellCheck={false} />
              </div>
              <div>
                <label className="label" htmlFor="cmd-args">
                  参数（可不填）
                </label>
                <input id="cmd-args" className="input font-mono" value={editing.draft.args} onChange={(e) => set("args", e.target.value)} placeholder="[可选] <必填>" spellCheck={false} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="cmd-desc">
                说明
              </label>
              <textarea id="cmd-desc" className="input min-h-20" value={editing.draft.description} onChange={(e) => set("description", e.target.value)} placeholder="这条命令是做什么的" />
            </div>

            <div>
              <label className="label" htmlFor="cmd-example">
                例子（可不填）
              </label>
              <input id="cmd-example" className="input font-mono" value={editing.draft.example} onChange={(e) => set("example", e.target.value)} placeholder="/my-command 参数" spellCheck={false} />
            </div>

            <div className="grid grid-cols-2 gap-3">
              <div>
                <label className="label" htmlFor="cmd-cat">
                  分类
                </label>
                <input id="cmd-cat" className="input" list="cmd-cats" value={editing.draft.category} onChange={(e) => set("category", e.target.value)} placeholder="不填放进「我的命令」" />
                <datalist id="cmd-cats">
                  {categories.map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
              </div>
              <div>
                <label className="label" htmlFor="cmd-aliases">
                  别名（可不填）
                </label>
                <input id="cmd-aliases" className="input font-mono" value={editing.draft.aliases} onChange={(e) => set("aliases", e.target.value)} placeholder="/mc" spellCheck={false} />
              </div>
            </div>

            <div>
              <label className="label" htmlFor="cmd-note">
                我的备注
              </label>
              <textarea id="cmd-note" className="input min-h-20" value={editing.draft.note} onChange={(e) => set("note", e.target.value)} placeholder="什么时候用、踩过什么坑、自己的习惯用法" />
            </div>

            <label className="flex cursor-pointer items-center gap-2 text-sm">
              <input type="checkbox" className="size-4" checked={editing.draft.pinned} onChange={(e) => set("pinned", e.target.checked)} />
              标为常用
            </label>

            <ErrorText msg={error} />
            <div className="flex justify-end gap-2 pt-2">
              <button type="button" className="btn-ghost" onClick={() => setEditing(null)}>
                取消
              </button>
              <button className="btn-primary" disabled={saving}>
                {saving ? "保存中…" : editing.id ? "保存" : "添加"}
              </button>
            </div>
          </form>
        </Modal>
      )}
    </div>
  );
}
