import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { toast } from "sonner";
import { api, type Track } from "../api";

export type PlayMode = "list" | "one" | "shuffle";

type Prefs = { volume: number; mode: PlayMode; autoplay: boolean; lastId: number | null; collapsed: boolean };
const PREFS_KEY = "one-music-prefs";
const defaultPrefs: Prefs = { volume: 0.8, mode: "list", autoplay: true, lastId: null, collapsed: false };

function loadPrefs(): Prefs {
  try {
    return { ...defaultPrefs, ...JSON.parse(localStorage.getItem(PREFS_KEY) || "{}") };
  } catch {
    return defaultPrefs;
  }
}

type MusicCtx = {
  tracks: Track[];
  current: Track | null;
  playing: boolean;
  time: number;
  duration: number;
  volume: number;
  mode: PlayMode;
  autoplay: boolean;
  collapsed: boolean;
  /** 频谱分析器；只有上传的文件能分析（外链受浏览器跨域限制） */
  analyser: AnalyserNode | null;
  reload: () => Promise<Track[]>;
  play: (t?: Track) => Promise<void>;
  pause: () => void;
  toggle: () => void;
  next: () => void;
  prev: () => void;
  seek: (sec: number) => void;
  setVolume: (v: number) => void;
  setMode: (m: PlayMode) => void;
  setAutoplay: (v: boolean) => void;
  setCollapsed: (v: boolean) => void;
  /** 删除歌曲前调用：如果正在播放它，先停下并切到下一首 */
  forget: (id: number) => void;
};

const Ctx = createContext<MusicCtx | null>(null);

// 播放失败时，play() 的报错和 <audio> 的 error 事件会先后到达；用同一个 id，只显示一条提示
function failToast(t: Track) {
  const why = t.source === "url" ? "链接可能已失效，或者不是能直接播放的音频地址" : "文件可能已损坏，或浏览器不支持这种格式";
  toast.error(`「${t.title}」无法播放`, { id: "music-error", description: why });
}

export function MusicProvider({ children }: { children: ReactNode }) {
  const [prefs] = useState(loadPrefs);
  const [tracks, setTracks] = useState<Track[]>([]);
  const [currentId, setCurrentId] = useState<number | null>(prefs.lastId);
  const [playing, setPlaying] = useState(false);
  const [time, setTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [volume, setVolumeState] = useState(prefs.volume);
  const [mode, setModeState] = useState<PlayMode>(prefs.mode);
  const [autoplay, setAutoplay] = useState(prefs.autoplay);
  const [collapsed, setCollapsed] = useState(prefs.collapsed);
  const [analyser, setAnalyser] = useState<AnalyserNode | null>(null);

  // 两个 <audio>：上传的文件接入 Web Audio 做频谱；外链单独播放（跨域音频接入 Web Audio 会被静音）
  const [els] = useState(() => {
    const file = new Audio();
    const url = new Audio();
    file.preload = url.preload = "metadata";
    return { file, url };
  });
  const audioCtx = useRef<AudioContext | null>(null);
  const gain = useRef<GainNode | null>(null);
  const volumeRef = useRef(volume);
  const activeEl = useRef<HTMLAudioElement>(els.file);

  // 上传的文件：<audio> 自身音量固定为 1，用增益节点调音量。
  // 这样频谱分析器拿到的始终是原始信号，音量调小时柱子不会跟着变矮。
  const applyVolume = (vol: number) => {
    volumeRef.current = vol;
    els.url.volume = vol;
    if (gain.current) {
      els.file.volume = 1;
      gain.current.gain.value = vol;
    } else {
      els.file.volume = vol;
    }
  };

  // 事件回调里要读最新值，用 ref 存一份
  const tracksRef = useRef(tracks);
  const currentRef = useRef<Track | null>(null);
  const modeRef = useRef(mode);
  tracksRef.current = tracks;
  modeRef.current = mode;
  const current = useMemo(() => tracks.find((t) => t.id === currentId) ?? null, [tracks, currentId]);
  currentRef.current = current;

  const reload = useCallback(async () => {
    const list = await api.get<Track[]>("/music");
    setTracks(list);
    setCurrentId((id) => (id !== null && list.some((t) => t.id === id) ? id : (list[0]?.id ?? null)));
    return list;
  }, []);

  useEffect(() => {
    reload().catch(() => {});
  }, [reload]);

  // 保存偏好到本浏览器
  useEffect(() => {
    try {
      localStorage.setItem(PREFS_KEY, JSON.stringify({ volume, mode, autoplay, lastId: currentId, collapsed }));
    } catch {
      /* 隐私模式等情况下存不了，忽略 */
    }
  }, [volume, mode, autoplay, currentId, collapsed]);

  const ensureAudioGraph = () => {
    if (audioCtx.current) return audioCtx.current;
    const AC = window.AudioContext ?? (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    const ctx = new AC();
    const source = ctx.createMediaElementSource(els.file);
    const node = ctx.createAnalyser();
    node.fftSize = 256;
    node.smoothingTimeConstant = 0.78;
    // 信号走向：<audio> → 分析器 → 增益（音量）→ 扬声器
    const g = ctx.createGain();
    source.connect(node);
    node.connect(g);
    g.connect(ctx.destination);
    audioCtx.current = ctx;
    gain.current = g;
    applyVolume(volumeRef.current);
    setAnalyser(node);
    return ctx;
  };

  /** 把歌曲装进对应的 <audio>，并暂停另一个 */
  const load = (t: Track) => {
    const el = t.source === "file" ? els.file : els.url;
    const other = el === els.file ? els.url : els.file;
    other.pause();
    if (el.dataset.trackId !== String(t.id)) {
      el.src = t.src;
      el.dataset.trackId = String(t.id);
      setTime(0);
      setDuration(0);
    }
    el.loop = modeRef.current === "one";
    activeEl.current = el;
    return el;
  };

  const play = useCallback(async (t?: Track) => {
    const track = t ?? currentRef.current ?? tracksRef.current[0];
    if (!track) return;
    setCurrentId(track.id);
    const el = load(track);
    if (track.source === "file") await ensureAudioGraph()?.resume();
    try {
      await el.play();
    } catch (e) {
      const err = e as DOMException;
      if (err.name === "NotAllowedError") return; // 浏览器还不允许出声（用户没点过页面）
      if (err.name === "AbortError") return; // 播放被下一次切歌打断，正常
      failToast(track);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const pause = useCallback(() => activeEl.current.pause(), []);

  const step = useCallback(
    (dir: 1 | -1) => {
      const list = tracksRef.current;
      if (!list.length) return;
      const cur = currentRef.current;
      let idx = cur ? list.findIndex((t) => t.id === cur.id) : -1;
      if (modeRef.current === "shuffle" && list.length > 1) {
        let r = idx;
        while (r === idx) r = Math.floor(Math.random() * list.length);
        idx = r;
      } else {
        idx = (idx + dir + list.length) % list.length;
      }
      play(list[idx]);
    },
    [play],
  );

  const next = useCallback(() => step(1), [step]);
  const prev = useCallback(() => {
    // 播放超过 3 秒时，"上一首"先回到本曲开头，和大多数播放器一样
    if (activeEl.current.currentTime > 3) activeEl.current.currentTime = 0;
    else step(-1);
  }, [step]);

  const toggle = useCallback(() => {
    if (!activeEl.current.paused) pause();
    else play();
  }, [pause, play]);

  const seek = useCallback((sec: number) => {
    const el = activeEl.current;
    if (Number.isFinite(el.duration)) el.currentTime = Math.max(0, Math.min(sec, el.duration));
  }, []);

  const setVolume = useCallback(
    (v: number) => {
      const vol = Math.max(0, Math.min(1, v));
      applyVolume(vol);
      setVolumeState(vol);
    },
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [els],
  );

  const setMode = useCallback(
    (m: PlayMode) => {
      setModeState(m);
      modeRef.current = m;
      els.file.loop = els.url.loop = m === "one";
    },
    [els],
  );

  const forget = useCallback(
    (id: number) => {
      for (const el of [els.file, els.url]) {
        if (el.dataset.trackId === String(id)) {
          el.pause();
          el.removeAttribute("src");
          delete el.dataset.trackId;
          el.load();
        }
      }
      if (currentRef.current?.id === id) {
        setPlaying(false);
        setTime(0);
        setDuration(0);
      }
    },
    [els],
  );

  // 绑定 <audio> 事件：只认当前正在用的那个
  useEffect(() => {
    applyVolume(volumeRef.current);
    const handlers: [HTMLAudioElement, string, EventListener][] = [];
    for (const el of [els.file, els.url]) {
      const on = (type: string, fn: () => void) => {
        const h = () => {
          if (el === activeEl.current) fn();
        };
        el.addEventListener(type, h);
        handlers.push([el, type, h]);
      };
      on("play", () => setPlaying(true));
      on("pause", () => setPlaying(false));
      on("timeupdate", () => setTime(el.currentTime));
      on("durationchange", () => setDuration(Number.isFinite(el.duration) ? el.duration : 0));
      on("ended", () => step(1));
      on("error", () => {
        if (!el.getAttribute("src")) return;
        setPlaying(false);
        const t = currentRef.current;
        if (t) failToast(t);
        else toast.error("歌曲加载失败", { id: "music-error" });
      });
    }
    return () => handlers.forEach(([el, type, h]) => el.removeEventListener(type, h));
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [els, step]);

  // 自动播放：浏览器要求先有一次用户操作，所以在第一次点击或按键时开始播放
  useEffect(() => {
    if (!autoplay || !tracks.length) return;
    const start = (e: Event) => {
      cleanup();
      if ((e.target as Element | null)?.closest?.("[data-music-player]")) return; // 点的就是播放器，交给它自己处理
      if (activeEl.current.paused) play();
    };
    const cleanup = () => {
      document.removeEventListener("pointerdown", start, true);
      document.removeEventListener("keydown", start, true);
    };
    document.addEventListener("pointerdown", start, true);
    document.addEventListener("keydown", start, true);
    return cleanup;
    // 只在第一次拿到歌单时挂一次
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [autoplay, tracks.length > 0]);

  // 系统媒体控制：键盘上的播放/切歌键、系统音量浮窗里显示歌名
  useEffect(() => {
    const ms = navigator.mediaSession;
    if (!ms) return;
    ms.metadata = current ? new MediaMetadata({ title: current.title, artist: current.artist || "ONE", album: "ONE" }) : null;
    const set = (a: MediaSessionAction, h: MediaSessionActionHandler | null) => {
      try {
        ms.setActionHandler(a, h);
      } catch {
        /* 有的浏览器不支持某些动作 */
      }
    };
    set("play", () => play());
    set("pause", () => pause());
    set("previoustrack", () => prev());
    set("nexttrack", () => next());
  }, [current, play, pause, prev, next]);

  // 退出登录（组件卸载）时停止播放
  useEffect(() => () => {
    els.file.pause();
    els.url.pause();
    audioCtx.current?.close().catch(() => {});
  }, [els]);

  const value: MusicCtx = {
    tracks,
    current,
    playing,
    time,
    duration,
    volume,
    mode,
    autoplay,
    collapsed,
    analyser: current?.source === "file" ? analyser : null,
    reload,
    play,
    pause,
    toggle,
    next,
    prev,
    seek,
    setVolume,
    setMode,
    setAutoplay,
    setCollapsed,
    forget,
  };
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function useMusic() {
  const c = useContext(Ctx);
  if (!c) throw new Error("useMusic must be used inside MusicProvider");
  return c;
}
