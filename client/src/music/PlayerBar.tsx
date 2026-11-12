import { useEffect, useMemo, useRef, useState, type ChangeEvent, type FormEvent } from "react";
import {
  ChevronDown,
  Disc3,
  Link2,
  ListMusic,
  Pause,
  Pencil,
  Play,
  Plus,
  Repeat,
  Repeat1,
  ScrollText,
  Shuffle,
  SkipBack,
  SkipForward,
  Trash2,
  Upload,
  Volume2,
  VolumeX,
  X,
  type LucideIcon,
} from "lucide-react";
import { toast } from "sonner";
import { api, uploadFile, type Track } from "../api";
import Modal, { ErrorText } from "../components/Modal";
import { confirmDialog } from "../components/Confirm";
import { useMusic, type PlayMode } from "./MusicContext";
import Spectrum from "./Spectrum";
import { currentLine, fmtTime, parseLrc, readTextFile, type LyricLine } from "./lrc";

const MODES: Record<PlayMode, { label: string; icon: LucideIcon; next: PlayMode }> = {
  list: { label: "列表循环", icon: Repeat, next: "one" },
  one: { label: "单曲循环", icon: Repeat1, next: "shuffle" },
  shuffle: { label: "随机播放", icon: Shuffle, next: "list" },
};

const AUDIO_ACCEPT = ".mp3,.m4a,.aac,.ogg,.oga,.opus,.wav,.flac,.webm,.lrc";
const MAX_MB = 100;
const baseName = (n: string) => n.replace(/\.[^.]+$/, "").trim().toLowerCase();

export default function PlayerBar() {
  const m = useMusic();
  const [panel, setPanel] = useState<"list" | "lyrics" | null>(null);
  const [editing, setEditing] = useState<Track | null>(null);
  const [linking, setLinking] = useState(false);
  const fileInput = useRef<HTMLInputElement>(null);
  const lastVolume = useRef(m.volume || 0.8);

  const lines = useMemo(() => parseLrc(m.current?.lyrics ?? ""), [m.current?.lyrics]);
  const lineIdx = currentLine(lines, m.time);
  const pct = m.duration ? Math.min(100, (m.time / m.duration) * 100) : 0;
  const Mode = MODES[m.mode];
  const hasTracks = m.tracks.length > 0;

  // 选了文件：音频逐个上传；同名的 .lrc 自动配成歌词
  const onFiles = async (e: ChangeEvent<HTMLInputElement>) => {
    const files = [...(e.target.files ?? [])];
    e.target.value = ""; // 清空，下次选同一个文件也能触发
    if (!files.length) return;
    const lrcs = files.filter((f) => /\.lrc$/i.test(f.name));
    const audios = files.filter((f) => !lrcs.includes(f));

    const tid = toast.loading("正在处理…");
    const errors: string[] = [];
    const uploaded: { track: Track; base: string }[] = [];

    for (const [i, f] of audios.entries()) {
      toast.loading(`正在上传 ${i + 1}/${audios.length}：${f.name}`, { id: tid });
      if (f.size > MAX_MB * 1024 * 1024) {
        errors.push(`${f.name}：超过 ${MAX_MB} MB`);
        continue;
      }
      try {
        const fd = new FormData();
        fd.append("file", f);
        uploaded.push({ track: await uploadFile<Track>("/music/upload", fd), base: baseName(f.name) });
      } catch (err) {
        errors.push(`${f.name}：${(err as Error).message}`);
      }
    }

    let lyricCount = 0;
    const known = [
      ...uploaded,
      ...m.tracks.flatMap((t) => [
        { track: t, base: t.title.toLowerCase() },
        { track: t, base: `${t.artist} - ${t.title}`.toLowerCase() },
      ]),
    ];
    for (const l of lrcs) {
      const hit = known.find((k) => k.base === baseName(l.name));
      if (!hit) {
        errors.push(`${l.name}：没有找到同名的歌曲`);
        continue;
      }
      try {
        await api.put(`/music/${hit.track.id}`, { lyrics: await readTextFile(l) });
        lyricCount++;
      } catch (err) {
        errors.push(`${l.name}：${(err as Error).message}`);
      }
    }

    const list = await m.reload();
    const done = [uploaded.length && `添加了 ${uploaded.length} 首歌`, lyricCount && `配上了 ${lyricCount} 份歌词`].filter(Boolean).join("，");
    if (done) toast.success(done, { id: tid });
    else toast.dismiss(tid);
    if (errors.length) toast.error(errors.join("\n"), { duration: 8000 });

    // 刚上传完且没在播放：直接播第一首新歌
    const first = uploaded[0] && list.find((t) => t.id === uploaded[0].track.id);
    if (first && !m.playing) m.play(first);
  };

  const remove = async (t: Track) => {
    const ok = await confirmDialog({
      title: "删除这首歌？",
      message: `「${t.title}」${t.source === "file" ? "和它的音频文件" : ""}会被删除，无法恢复。`,
    });
    if (!ok) return;
    m.forget(t.id);
    try {
      await api.del(`/music/${t.id}`);
      toast.success("已删除");
    } catch (err) {
      toast.error((err as Error).message);
    }
    m.reload();
  };

  const toggleMute = () => {
    if (m.volume > 0) {
      lastVolume.current = m.volume;
      m.setVolume(0);
    } else {
      m.setVolume(lastVolume.current || 0.8);
    }
  };

  // ---------- 收起状态：右下角一个小圆片 ----------
  if (m.collapsed) {
    return (
      <div data-music-player className="glass fixed bottom-3 right-3 z-40 flex items-center gap-1 rounded-full p-1.5">
        <button
          className="grid size-9 place-items-center rounded-full bg-ink text-paper transition active:scale-90 disabled:opacity-40"
          onClick={m.toggle}
          disabled={!hasTracks}
          aria-label={m.playing ? "暂停" : "播放"}
        >
          {m.playing ? <Pause className="size-4" /> : <Play className="size-4 translate-x-px" />}
        </button>
        <button className="btn-ghost rounded-full p-2" onClick={() => m.setCollapsed(false)} title="展开播放器" aria-label="展开播放器">
          <Disc3 className={`size-5 ${m.playing ? "animate-spin [animation-duration:5s]" : ""}`} />
        </button>
      </div>
    );
  }

  const sub = !m.current
    ? "点右边的 + 添加几首喜欢的歌"
    : lineIdx >= 0 && lines[lineIdx].text
      ? lines[lineIdx].text
      : m.current.artist || (m.current.source === "url" ? "外部链接" : "本地上传");

  return (
    <>
      <input ref={fileInput} type="file" accept={AUDIO_ACCEPT} multiple hidden onChange={onFiles} />

      {/* 桌面端停在侧边栏右侧（侧边栏宽 14rem + 两边各 0.75rem 外边距） */}
      <div data-music-player className="fixed inset-x-0 bottom-0 z-40 md:bottom-3 md:left-[15.5rem] md:right-3">
        {panel && (
          <div className="absolute bottom-full right-0 w-full px-2 pb-2 md:w-[26rem] md:px-0">
            <section className="modal-panel glass-strong flex max-h-[min(60vh,30rem)] flex-col overflow-hidden rounded-[24px]">
              <header className="flex items-center gap-1 border-b border-line p-2">
                {(["list", "lyrics"] as const).map((k) => (
                  <button
                    key={k}
                    onClick={() => setPanel(k)}
                    className={`flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-sm transition ${panel === k ? "bg-ink/8 font-medium" : "text-slate-600 hover:bg-ink/5"}`}
                  >
                    {k === "list" ? <><ListMusic className="size-4" /> 歌单 {m.tracks.length}</> : <><ScrollText className="size-4" /> 歌词</>}
                  </button>
                ))}
                <button className="btn-ghost ml-auto p-1.5" onClick={() => setPanel(null)} aria-label="关闭面板">
                  <X className="size-4" />
                </button>
              </header>

              {panel === "list" ? (
                <>
                  <div className="flex gap-2 p-2">
                    <button className="btn-primary flex-1 py-1.5" onClick={() => fileInput.current?.click()}>
                      <Upload className="size-4" /> 上传文件
                    </button>
                    <button className="btn flex-1 bg-ink/6 py-1.5 text-slate-700 hover:bg-ink/10" onClick={() => setLinking(true)}>
                      <Link2 className="size-4" /> 添加链接
                    </button>
                  </div>
                  <ul className="min-h-0 flex-1 overflow-y-auto px-2 pb-2">
                    {!hasTracks && (
                      <li className="px-3 py-8 text-center text-sm text-slate-500">
                        歌单是空的。上传电脑里的 mp3、flac 等文件，或者粘贴一个音频链接。
                        <br />
                        同时选中同名的 .lrc 文件，会自动配上歌词。
                      </li>
                    )}
                    {m.tracks.map((t, i) => {
                      const active = t.id === m.current?.id;
                      return (
                        <li key={t.id} className={`group flex items-center gap-1 rounded-lg pr-1 transition ${active ? "bg-ink/6" : "hover:bg-ink/[0.04]"}`}>
                          <button className="flex min-w-0 flex-1 items-center gap-3 px-2 py-2 text-left" onClick={() => (active ? m.toggle() : m.play(t))}>
                            <span className="grid w-5 shrink-0 place-items-center text-xs tabular-nums text-slate-400">
                              {active ? m.playing ? <Volume2 className="size-4 text-brand" /> : <Pause className="size-4 text-brand" /> : i + 1}
                            </span>
                            <span className="min-w-0 flex-1">
                              <span className={`block truncate text-sm ${active ? "font-medium text-brand" : ""}`}>{t.title}</span>
                              <span className="flex items-center gap-1 truncate text-xs text-slate-500">
                                {t.source === "url" && <Link2 className="size-3 shrink-0" />}
                                {t.artist || (t.source === "url" ? "外部链接" : "未知歌手")}
                                {t.lyrics && <span className="ml-1 rounded bg-brand/12 px-1 text-[10px] text-brand">词</span>}
                              </span>
                            </span>
                          </button>
                          <button className="btn-ghost p-1.5 md:opacity-0 md:group-hover:opacity-100" title="编辑信息和歌词" aria-label={`编辑 ${t.title}`} onClick={() => setEditing(t)}>
                            <Pencil className="size-3.5" />
                          </button>
                          <button className="btn-danger p-1.5 md:opacity-0 md:group-hover:opacity-100" title="删除" aria-label={`删除 ${t.title}`} onClick={() => remove(t)}>
                            <Trash2 className="size-3.5" />
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                  <label className="flex items-center gap-2 border-t border-line px-3 py-2 text-xs text-slate-600">
                    <input type="checkbox" className="size-3.5 accent-brand" checked={m.autoplay} onChange={(e) => m.setAutoplay(e.target.checked)} />
                    打开网站后，第一次点击页面时自动开始播放
                  </label>
                </>
              ) : (
                <LyricsView
                  track={m.current}
                  lines={lines}
                  active={lineIdx}
                  onSeek={(t) => {
                    m.seek(t);
                    if (!m.playing) m.play();
                  }}
                  onEdit={() => m.current && setEditing(m.current)}
                />
              )}

              <Spectrum analyser={m.analyser} playing={m.playing} bars={48} className="h-10 w-full shrink-0 opacity-80" />
            </section>
          </div>
        )}

        <div className="glass relative flex items-center gap-2 border-x-0 border-b-0 px-3 py-2 md:gap-3 md:rounded-[24px] md:border md:px-4">
          {/* 较窄时：顶边一条细进度线，点击或按左右方向键跳转；够宽（xl）时用下面可拖动的进度条 */}
          <div
            className="absolute inset-x-0 -top-1.5 h-4 cursor-pointer md:inset-x-4 xl:hidden"
            role="slider"
            tabIndex={m.duration ? 0 : -1}
            aria-label="播放进度"
            aria-valuemin={0}
            aria-valuemax={Math.round(m.duration)}
            aria-valuenow={Math.round(m.time)}
            aria-valuetext={`${fmtTime(m.time)} / ${fmtTime(m.duration)}`}
            onPointerDown={(e) => {
              if (!m.duration) return;
              const r = e.currentTarget.getBoundingClientRect();
              m.seek(((e.clientX - r.left) / r.width) * m.duration);
            }}
            onKeyDown={(e) => {
              if (e.key === "ArrowRight") m.seek(m.time + 5);
              if (e.key === "ArrowLeft") m.seek(m.time - 5);
            }}
          >
            <div className="absolute inset-x-0 top-1.5 h-[3px] overflow-hidden rounded-full bg-ink/10">
              <div className="h-full rounded-full bg-brand transition-[width] duration-300" style={{ width: `${pct}%` }} />
            </div>
          </div>

          <button
            className="grid size-10 shrink-0 place-items-center rounded-full bg-ink text-paper"
            onClick={() => setPanel(panel === "lyrics" ? null : "lyrics")}
            title="歌词"
            aria-label="打开歌词"
          >
            <Disc3 className={`size-5 ${m.playing ? "animate-spin [animation-duration:5s]" : ""}`} />
          </button>

          <div className="min-w-0 flex-1 xl:w-52 xl:flex-none">
            <div className="truncate text-sm font-medium">{m.current?.title ?? "还没有音乐"}</div>
            <div className={`truncate text-xs ${lineIdx >= 0 && m.current ? "text-brand" : "text-slate-500"}`}>{sub}</div>
          </div>

          <Spectrum analyser={m.analyser} playing={m.playing} bars={16} className="hidden h-8 w-16 shrink-0 sm:block" />

          <div className="flex shrink-0 items-center gap-0.5">
            <button className="btn-ghost hidden p-2 sm:inline-flex" onClick={m.prev} disabled={!hasTracks} aria-label="上一首" title="上一首">
              <SkipBack className="size-4" />
            </button>
            <button
              className="grid size-10 place-items-center rounded-full bg-ink text-paper transition hover:bg-ink/85 active:scale-90 disabled:opacity-40"
              onClick={m.toggle}
              disabled={!hasTracks}
              aria-label={m.playing ? "暂停" : "播放"}
            >
              {m.playing ? <Pause className="size-[18px]" /> : <Play className="size-[18px] translate-x-px" />}
            </button>
            <button className="btn-ghost p-2" onClick={m.next} disabled={!hasTracks} aria-label="下一首" title="下一首">
              <SkipForward className="size-4" />
            </button>
          </div>

          {m.current && (
            <span className="hidden shrink-0 text-xs tabular-nums text-slate-500 sm:block xl:hidden">
              {fmtTime(m.time)} / {fmtTime(m.duration)}
            </span>
          )}

          <div className="hidden min-w-0 flex-1 items-center gap-2 text-xs tabular-nums text-slate-500 xl:flex">
            <span className="w-9 text-right">{fmtTime(m.time)}</span>
            <input
              type="range"
              className="h-1 min-w-0 flex-1 cursor-pointer accent-brand"
              min={0}
              max={m.duration || 0}
              step={0.1}
              value={Math.min(m.time, m.duration || 0)}
              disabled={!m.duration}
              onChange={(e) => m.seek(Number(e.target.value))}
              aria-label="播放进度"
            />
            <span className="w-9">{fmtTime(m.duration)}</span>
          </div>

          <div className="flex shrink-0 items-center gap-0.5">
            <button className="btn-ghost p-2" onClick={() => m.setMode(Mode.next)} title={`${Mode.label}（点击切换）`} aria-label={`播放模式：${Mode.label}`}>
              <Mode.icon className="size-4" />
            </button>
            <div className="hidden items-center md:flex">
              <button className="btn-ghost p-2" onClick={toggleMute} aria-label={m.volume > 0 ? "静音" : "取消静音"} title={m.volume > 0 ? "静音" : "取消静音"}>
                {m.volume > 0 ? <Volume2 className="size-4" /> : <VolumeX className="size-4" />}
              </button>
              <input
                type="range"
                className="hidden h-1 w-20 cursor-pointer accent-brand xl:block"
                min={0}
                max={1}
                step={0.01}
                value={m.volume}
                onChange={(e) => m.setVolume(Number(e.target.value))}
                aria-label="音量"
              />
            </div>
            <button
              className={`btn-ghost p-2 ${panel === "list" ? "bg-ink/8" : ""}`}
              onClick={() => setPanel(panel === "list" ? null : "list")}
              aria-label="歌单"
              title="歌单"
              aria-expanded={panel === "list"}
            >
              {hasTracks ? <ListMusic className="size-4" /> : <Plus className="size-4" />}
            </button>
            <button
              className="btn-ghost p-2"
              onClick={() => {
                setPanel(null);
                m.setCollapsed(true);
              }}
              aria-label="收起播放器"
              title="收起播放器"
            >
              <ChevronDown className="size-4" />
            </button>
          </div>
        </div>
      </div>

      {/* 弹窗放在播放条外面：毛玻璃（backdrop-filter）会把里面的 fixed 元素"关"在自己范围内 */}
      {editing && (
        <TrackEditor
          track={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            setEditing(null);
            m.reload();
          }}
        />
      )}
      {linking && (
        <LinkDialog
          onClose={() => setLinking(false)}
          onSaved={async (t) => {
            setLinking(false);
            const list = await m.reload();
            const added = list.find((x) => x.id === t.id);
            if (added && !m.playing) m.play(added);
          }}
        />
      )}
    </>
  );
}

// ---------------- 歌词 ----------------
function LyricsView({
  track,
  lines,
  active,
  onSeek,
  onEdit,
}: {
  track: Track | null;
  lines: LyricLine[];
  active: number;
  onSeek: (time: number) => void;
  onEdit: () => void;
}) {
  const box = useRef<HTMLDivElement>(null);
  const activeRef = useRef<HTMLButtonElement>(null);

  // 当前这一句滚动到面板中间（只滚动歌词区域，不带动整个页面）
  useEffect(() => {
    const b = box.current;
    const a = activeRef.current;
    if (!b || !a) return;
    b.scrollTo({ top: a.offsetTop - b.clientHeight / 2 + a.clientHeight / 2, behavior: "smooth" });
  }, [active, track?.id]);

  if (!track) return <p className="flex-1 px-4 py-10 text-center text-sm text-slate-500">还没有选歌</p>;

  if (!track.lyrics.trim()) {
    return (
      <div className="flex flex-1 flex-col items-center gap-3 px-4 py-10 text-center text-sm text-slate-500">
        <p>「{track.title}」还没有歌词</p>
        <button className="btn-primary py-1.5" onClick={onEdit}>
          <Plus className="size-4" /> 添加歌词
        </button>
        <p className="text-xs">支持 .lrc 文件，带时间标记的歌词会跟着播放滚动</p>
      </div>
    );
  }

  return (
    <div ref={box} className="relative min-h-40 flex-1 overflow-y-auto px-4 py-6 text-center">
      {lines.length === 0 ? (
        // 没有时间标记的纯文本歌词：整段显示
        <p className="whitespace-pre-wrap text-sm leading-7 text-slate-700">{track.lyrics}</p>
      ) : (
        lines.map((l, i) => (
          <button
            key={`${l.time}-${i}`}
            ref={i === active ? activeRef : undefined}
            onClick={() => onSeek(l.time)}
            title={`跳到 ${fmtTime(l.time)}`}
            className={`block w-full rounded px-2 py-1 transition-all duration-300 hover:bg-ink/5 ${
              i === active ? "text-base font-semibold text-brand" : "text-sm text-slate-500"
            }`}
          >
            {l.text || "·"}
          </button>
        ))
      )}
      <button className="btn-ghost mx-auto mt-4 py-1 text-xs" onClick={onEdit}>
        <Pencil className="size-3" /> 编辑歌词
      </button>
    </div>
  );
}

// ---------------- 编辑歌曲信息和歌词 ----------------
function TrackEditor({ track, onClose, onSaved }: { track: Track; onClose: () => void; onSaved: () => void }) {
  const [title, setTitle] = useState(track.title);
  const [artist, setArtist] = useState(track.artist);
  const [lyrics, setLyrics] = useState(track.lyrics);
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const lrcInput = useRef<HTMLInputElement>(null);
  const timed = useMemo(() => parseLrc(lyrics).length, [lyrics]);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      await api.put(`/music/${track.id}`, { title, artist, lyrics });
      toast.success("已保存");
      onSaved();
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  const importLrc = async (e: ChangeEvent<HTMLInputElement>) => {
    const f = e.target.files?.[0];
    e.target.value = "";
    if (f) setLyrics(await readTextFile(f));
  };

  return (
    <Modal title="编辑歌曲" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="track-title">歌名</label>
            <input id="track-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} autoFocus />
          </div>
          <div>
            <label className="label" htmlFor="track-artist">歌手</label>
            <input id="track-artist" className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
        </div>
        <div>
          <div className="mb-1 flex items-center justify-between">
            <label className="label mb-0" htmlFor="track-lyrics">歌词</label>
            <button type="button" className="btn-ghost px-2 py-0.5 text-xs" onClick={() => lrcInput.current?.click()}>
              <Upload className="size-3" /> 导入 .lrc 文件
            </button>
            <input ref={lrcInput} type="file" accept=".lrc,.txt" hidden onChange={importLrc} />
          </div>
          <textarea
            id="track-lyrics"
            className="input min-h-56 font-mono text-xs leading-5"
            value={lyrics}
            onChange={(e) => setLyrics(e.target.value)}
            placeholder={"[00:12.50]第一句歌词\n[00:18.20]第二句歌词"}
            spellCheck={false}
          />
          <p className="mt-1 text-xs text-slate-500">
            {!lyrics.trim()
              ? "每行前面写上 [分:秒.毫秒]，歌词就会跟着播放滚动。"
              : timed > 0
                ? `识别到 ${timed} 行带时间的歌词，播放时会自动滚动。`
                : "没有识别到时间标记，歌词会整段显示，不会滚动。带时间的写法：[00:12.50]歌词"}
          </p>
        </div>
        <ErrorText msg={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={busy}>保存</button>
        </div>
      </form>
    </Modal>
  );
}

// ---------------- 添加外部链接 ----------------
function LinkDialog({ onClose, onSaved }: { onClose: () => void; onSaved: (t: Track) => void }) {
  const [url, setUrl] = useState("");
  const [title, setTitle] = useState("");
  const [artist, setArtist] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async (e: FormEvent) => {
    e.preventDefault();
    setError("");
    setBusy(true);
    try {
      const t = await api.post<Track>("/music", { url, title: title || undefined, artist });
      toast.success(`已添加「${t.title}」`);
      onSaved(t);
    } catch (err) {
      setError((err as Error).message);
    } finally {
      setBusy(false);
    }
  };

  return (
    <Modal title="添加音乐链接" onClose={onClose}>
      <form onSubmit={save} className="space-y-3">
        <div>
          <label className="label" htmlFor="link-url">音频地址</label>
          <input id="link-url" className="input" value={url} onChange={(e) => setUrl(e.target.value)} placeholder="https://example.com/song.mp3" autoFocus />
          <p className="mt-1 text-xs text-slate-500">
            需要是能直接播放的音频文件地址，通常以 .mp3、.m4a 等结尾。QQ 音乐、网易云的歌曲页面网址不行。
          </p>
        </div>
        <div className="grid grid-cols-2 gap-3">
          <div>
            <label className="label" htmlFor="link-title">歌名（可不填）</label>
            <input id="link-title" className="input" value={title} onChange={(e) => setTitle(e.target.value)} />
          </div>
          <div>
            <label className="label" htmlFor="link-artist">歌手（可不填）</label>
            <input id="link-artist" className="input" value={artist} onChange={(e) => setArtist(e.target.value)} />
          </div>
        </div>
        <ErrorText msg={error} />
        <div className="flex justify-end gap-2 pt-1">
          <button type="button" className="btn-ghost" onClick={onClose}>取消</button>
          <button className="btn-primary" disabled={busy || !url.trim()}>添加</button>
        </div>
      </form>
    </Modal>
  );
}
