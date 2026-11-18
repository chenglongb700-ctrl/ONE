import { useCallback, useEffect, useRef, useState, type KeyboardEvent, type PointerEvent } from "react";
import { useLocation, useNavigate } from "react-router-dom";
import { toast } from "sonner";
import { Bell, EyeOff, Hand, MessageCircleQuestion, PencilLine, Sparkles, X } from "lucide-react";
import { AI_EVENT, api, type AiActivity } from "../api";
import { DATA_CHANGED_EVENT } from "../components/AiCapture";
import { OPEN_AI_EVENT, type OpenAi } from "../components/AiMenu";
import { pageAiFor } from "../components/pageAi";
import Blob, { type Mood } from "./Blob";
import { AI_DONE, BUMPED, celebrate, DROPPED, greeting, grewUp, pick, POKE, streakLine, STREAK_MILESTONES } from "./lines";
import { memory, petPalette, setPetPrefs, usePetPrefs, type PetPos } from "./prefs";
import { aim, atRest, catchIt, createPhys, EDGE, paint, release, step, unpaint, viewH, viewW, type Phys } from "./physics";
import "./pet.css";

/**
 * 桌宠「果冻团子」：待在右下角（可以拖到任何地方），会呼吸、眨眼、眼睛跟着鼠标、偶尔蹦一下。
 * - AI 在干活时它冒气泡说"正在想…"，写完说"好啦"（api.ts 在每个 AI 请求前后发 AI_EVENT）
 * - 根据你的数据提醒：任务逾期、今天截止、倒计时快到、今天还没称体重 / 写随记（服务器 /api/pet 算好，不花 AI 的钱）
 *   每条提醒一天只说一次，两条之间至少隔 15 分钟
 * - 你记了东西它会高兴；记录的天数越多它长得越大（成长阶段由服务器按"一共记过几天"算）
 * - 点它：打开小菜单（当前页面的 AI 助手、记一笔、摸摸它、藏起来）
 * - 3 分钟没动鼠标键盘它就睡着，一动就醒
 * - 拖它：丝滑地跟着鼠标走；甩出去会滑一段，碰到窗口边会弹回来，撞扁了还会晃几下（physics.ts）
 */
type PetInfo = {
  today: string;
  todayCount: number;
  streak: number;
  totalDays: number;
  stage: { level: number; name: string; next: { name: string; daysLeft: number } | null };
  reminders: { id: string; text: string; to?: string }[];
  /** AI 今天用了多少 token、账户还剩多少钱（没配置 AI 时为 null；余额查不到时 balance 为 null） */
  ai: {
    model: string;
    today: { input: number; output: number; cached: number; total: number; calls: number };
    balance: { currency: string; amount: number } | null;
  } | null;
};

/** 12345 → "1.2 万"，860 → "860" */
const fmtTokens = (n: number) => (n < 10_000 ? n.toLocaleString("zh-CN") : `${(n / 10_000).toFixed(n < 100_000 ? 1 : 0)} 万`);
const fmtMoney = (b: { currency: string; amount: number }) =>
  b.currency === "CNY" ? `¥${b.amount.toFixed(2)}` : b.currency === "USD" ? `${b.amount.toFixed(2)}` : `${b.amount.toFixed(2)} ${b.currency}`;
type Bubble = { text: string; to?: string; key: number };
type Anim = "hop" | "jiggle" | "look" | "sway" | "land";

const SIZE = 76; // 团子默认的宽高（像素）；设置里可以调大小，成长阶段越高也会再大一点
const SLEEP_AFTER = 3 * 60_000;
const REMINDER_GAP = 15 * 60_000;
const RELOAD_EVERY = 10 * 60_000;

const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi));
const defaultPos = (): PetPos => ({ right: 22, bottom: window.innerWidth < 768 ? 84 : 92 }); // 播放条上面

/** 右侧的 AI 面板在宽屏上停靠时（见 SidePanel / index.css），团子也往左让一让 */
function usePanelDocked() {
  const check = () => document.documentElement.dataset.sidePanel === "open" && window.matchMedia("(min-width: 1400px)").matches;
  const [docked, setDocked] = useState(check);
  useEffect(() => {
    const update = () => setDocked(check());
    const mo = new MutationObserver(update);
    mo.observe(document.documentElement, { attributes: true, attributeFilter: ["data-side-panel"] });
    window.addEventListener("resize", update);
    return () => {
      mo.disconnect();
      window.removeEventListener("resize", update);
    };
  }, []);
  return docked;
}

export default function Pet() {
  const prefs = usePetPrefs();
  const location = useLocation();
  const navigate = useNavigate();
  const page = pageAiFor(location.pathname);
  const docked = usePanelDocked();

  const [info, setInfo] = useState<PetInfo | null>(null);
  const [bubble, setBubble] = useState<Bubble | null>(null);
  const [menu, setMenu] = useState(false);
  const [aiBusy, setAiBusy] = useState(0);
  const [asleep, setAsleep] = useState(false);
  const [tempMood, setTempMood] = useState<Mood | null>(null);
  const [anim, setAnim] = useState<{ name: Anim; key: number } | null>(null);
  // 拖着或者飞着的时候：容器的 right/bottom 固定在出发点，实际位移由 physics.ts 每帧写 transform
  const [fly, setFly] = useState<PetPos | null>(null);

  const root = useRef<HTMLDivElement>(null);
  const bubbleTimer = useRef<number>(0);
  const moodTimer = useRef<number>(0);
  const lastActive = useRef(Date.now());
  const lastReminder = useRef(0);
  const prevInfo = useRef<PetInfo | null>(null);
  const jelly = useRef<HTMLDivElement>(null);
  const squash = useRef<HTMLDivElement>(null);
  /** 按下了还没松手（moved：已经拖起来了，不再算"点一下"） */
  const pointer = useRef<{ id: number; x: number; y: number; moved: boolean } | null>(null);
  const phys = useRef<Phys | null>(null);
  const raf = useRef(0);
  const sizeRef = useRef(SIZE);
  const finishRef = useRef<(p: Phys) => void>(() => {});
  const handlers = useRef<{ move: (e: globalThis.PointerEvent) => void; up: (e: globalThis.PointerEvent) => void }>({ move: () => {}, up: () => {} });
  const moving = () => !!(pointer.current || phys.current);
  const busyRef = useRef(0);
  busyRef.current = aiBusy;

  // ---------- 小工具 ----------
  const play = useCallback((name: Anim) => setAnim({ name, key: Date.now() }), []);
  const say = useCallback((text: string, opts: { to?: string; mood?: Mood; ms?: number; sticky?: boolean } = {}) => {
    window.clearTimeout(bubbleTimer.current);
    window.clearTimeout(moodTimer.current);
    setBubble({ text, to: opts.to, key: Date.now() });
    setTempMood(opts.mood ?? null);
    if (!opts.sticky) {
      const ms = opts.ms ?? 6000;
      bubbleTimer.current = window.setTimeout(() => setBubble(null), ms);
      moodTimer.current = window.setTimeout(() => setTempMood(null), Math.min(ms, 3000));
    }
  }, []);
  const hush = useCallback(() => {
    window.clearTimeout(bubbleTimer.current);
    setBubble(null);
    setTempMood(null);
  }, []);

  // ---------- 读数据，看看有没有值得高兴的 ----------
  const load = useCallback(async (): Promise<PetInfo | null> => {
    let got: PetInfo;
    try {
      got = await api.get<PetInfo>("/pet");
    } catch {
      return null; // 没登录或者服务器没开，就安静待着
    }
    const prev = prevInfo.current;
    prevInfo.current = got;
    setInfo(got);

    const lastLevel = memory.get<number | null>("level", null);
    memory.set("level", got.stage.level);
    if (lastLevel !== null && got.stage.level > lastLevel) {
      say(grewUp(got.stage.name), { mood: "happy", ms: 8000 });
      play("hop");
      return got;
    }
    if (prev && prev.today === got.today && got.todayCount > prev.todayCount && busyRef.current === 0) {
      const milestone = STREAK_MILESTONES.includes(got.streak) && prev.streak < got.streak;
      say(milestone ? streakLine(got.streak) : celebrate(got.todayCount), { mood: "happy", ms: 5000 });
      play("hop");
    }
    return got;
  }, [say, play]);

  useEffect(() => {
    load();
  }, [load, location.pathname]); // 换页面时顺便看一眼（刚在页面上记的东西也能马上看到）
  useEffect(() => {
    const again = () => load();
    window.addEventListener(DATA_CHANGED_EVENT, again);
    window.addEventListener("focus", again);
    const t = window.setInterval(again, RELOAD_EVERY);
    return () => {
      window.removeEventListener(DATA_CHANGED_EVENT, again);
      window.removeEventListener("focus", again);
      window.clearInterval(t);
    };
  }, [load]);

  // ---------- 打招呼和提醒 ----------
  useEffect(() => {
    if (!info) return;
    const tryRemind = () => {
      if (busyRef.current > 0 || moving() || document.hidden) return;
      if (Date.now() - lastActive.current > SLEEP_AFTER) return; // 睡着了 / 人不在，不说话
      const today = info.today;
      // 每天第一次：先打招呼
      if (memory.get("greeted", "") !== today) {
        memory.set("greeted", today);
        lastReminder.current = Date.now();
        say(greeting(prefs.name), { mood: "happy", ms: 6000 });
        play("hop");
        return;
      }
      if (Date.now() - lastReminder.current < REMINDER_GAP) return;
      const shown = memory.get<{ date: string; ids: string[] }>("shown", { date: "", ids: [] });
      const ids = shown.date === today ? shown.ids : [];
      const next = info.reminders.find((r) => !ids.includes(r.id));
      if (!next) return;
      memory.set("shown", { date: today, ids: [...ids, next.id] });
      lastReminder.current = Date.now();
      say(next.text, { to: next.to, mood: next.id.startsWith("overdue") ? "worried" : undefined, ms: 10_000 });
      play("sway");
    };
    const first = window.setTimeout(tryRemind, 2500);
    const t = window.setInterval(tryRemind, 60_000);
    return () => {
      window.clearTimeout(first);
      window.clearInterval(t);
    };
  }, [info, prefs.name, say, play]);

  // ---------- AI 在干什么 ----------
  useEffect(() => {
    const onAi = (e: Event) => {
      const d = (e as CustomEvent<AiActivity>).detail;
      lastActive.current = Date.now();
      setAsleep(false);
      if (d.phase === "start") {
        setAiBusy((n) => n + 1);
        say(`${d.label}…`, { sticky: true, mood: "think" });
      } else {
        setAiBusy((n) => Math.max(0, n - 1));
        if (d.aborted) hush();
        else if (d.ok) {
          const done = pick(AI_DONE);
          const before = prevInfo.current?.ai?.today.total;
          say(done, { mood: "happy", ms: 5000 });
          play("hop");
          // 再读一次数据，看这次用了多少 token，接在"好啦"后面（气泡还是那一个，只换字）
          load().then((got) => {
            const after = got?.ai?.today.total;
            if (before === undefined || after === undefined || after <= before) return;
            const text = `${done} 这次用了 ${fmtTokens(after - before)} tokens`;
            setBubble((b) => (b && b.text === done ? { ...b, text } : b));
          });
        } else say("哎呀，AI 那边出错了", { mood: "worried", ms: 5000 });
      }
    };
    window.addEventListener(AI_EVENT, onAi);
    return () => window.removeEventListener(AI_EVENT, onAi);
  }, [say, hush, play, load]);

  // ---------- 睡觉、醒来、眼睛跟着鼠标 ----------
  useEffect(() => {
    let frame = 0;
    const active = (e?: globalThis.PointerEvent) => {
      lastActive.current = Date.now();
      setAsleep((was) => {
        if (was) window.setTimeout(() => say("嗯…我醒啦", { ms: 2500 }), 0);
        return false;
      });
      if (!e || frame) return;
      const { clientX, clientY } = e;
      frame = requestAnimationFrame(() => {
        frame = 0;
        const el = root.current;
        if (!el) return;
        const r = el.getBoundingClientRect();
        const dx = clientX - (r.left + r.width / 2);
        const dy = clientY - (r.top + r.height * 0.55);
        const len = Math.hypot(dx, dy) || 1;
        const k = Math.min(1, len / 240) * 3; // 离得越远看得越"偏"，最多 3 像素
        el.style.setProperty("--look-x", `${((dx / len) * k).toFixed(2)}px`);
        el.style.setProperty("--look-y", `${((dy / len) * k).toFixed(2)}px`);
      });
    };
    const onMove = (e: globalThis.PointerEvent) => active(e);
    const onOther = () => active();
    window.addEventListener("pointermove", onMove, { passive: true });
    window.addEventListener("keydown", onOther);
    window.addEventListener("wheel", onOther, { passive: true });
    const t = window.setInterval(() => {
      if (busyRef.current === 0 && !moving() && Date.now() - lastActive.current > SLEEP_AFTER) {
        setAsleep(true);
        setBubble(null);
        setMenu(false);
      }
    }, 15_000);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("keydown", onOther);
      window.removeEventListener("wheel", onOther);
      window.clearInterval(t);
    };
  }, [say]);

  // ---------- 闲着时偶尔做个小动作 ----------
  useEffect(() => {
    let t = 0;
    const next = () => {
      t = window.setTimeout(
        () => {
          if (!asleep && aiBusy === 0 && !bubble && !menu && !moving()) play(pick<Anim>(["look", "look", "sway", "hop"]));
          next();
        },
        18_000 + Math.random() * 25_000,
      );
    };
    next();
    return () => window.clearTimeout(t);
  }, [asleep, aiBusy, bubble, menu, play]);

  // 菜单开着时，点别处就收起
  useEffect(() => {
    if (!menu) return;
    const away = (e: MouseEvent) => !root.current?.contains(e.target as Node) && setMenu(false);
    const esc = (e: globalThis.KeyboardEvent) => e.key === "Escape" && setMenu(false);
    window.addEventListener("mousedown", away);
    window.addEventListener("keydown", esc);
    return () => {
      window.removeEventListener("mousedown", away);
      window.removeEventListener("keydown", esc);
    };
  }, [menu]);

  // 窗口变小了，别让团子跑到外面去
  const [, setWinSize] = useState(0);
  useEffect(() => {
    const onResize = () => setWinSize(window.innerWidth * 10_000 + window.innerHeight);
    window.addEventListener("resize", onResize);
    return () => window.removeEventListener("resize", onResize);
  }, []);

  useEffect(() => () => {
    window.clearTimeout(bubbleTimer.current);
    window.clearTimeout(moodTimer.current);
  }, []);

  // ---------- 拖动和甩出去的动画循环 ----------
  const tick = useCallback(function frame(now: number) {
    const p = phys.current;
    const el = root.current;
    if (!p || !el || !jelly.current || !squash.current) {
      raf.current = 0;
      return;
    }
    // 每帧最多算 64ms（切到别的标签页再回来不会"瞬移"），切成 1/120 秒的小步，弹簧才稳
    let dt = Math.min(0.064, Math.max(0, (now - p.last) / 1000));
    p.last = now;
    while (dt > 1e-6) {
      const h = Math.min(dt, 1 / 120);
      step(p, h, sizeRef.current);
      dt -= h;
    }
    paint(p, el, jelly.current, squash.current);
    if (atRest(p) || (p.mode !== "drag" && now - p.releasedAt > 8000)) {
      raf.current = 0;
      finishRef.current(p);
      return;
    }
    raf.current = requestAnimationFrame(frame);
  }, []);
  const run = useCallback(() => {
    if (raf.current) return;
    if (phys.current) phys.current.last = performance.now();
    raf.current = requestAnimationFrame(tick);
  }, [tick]);

  // 拖动时鼠标跑多快、跑多远都跟得上：在整个窗口上听
  useEffect(() => {
    const move = (e: globalThis.PointerEvent) => handlers.current.move(e);
    const up = (e: globalThis.PointerEvent) => handlers.current.up(e);
    window.addEventListener("pointermove", move);
    window.addEventListener("pointerup", up);
    window.addEventListener("pointercancel", up);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", up);
      window.removeEventListener("pointercancel", up);
      cancelAnimationFrame(raf.current);
      raf.current = 0;
    };
  }, []);

  if (!prefs.visible) return null;

  // ---------- 位置 ----------
  const level = info?.stage.level ?? 1;
  const size = Math.round(SIZE * prefs.scale * (0.88 + level * 0.04));
  sizeRef.current = size;
  const saved = fly ?? prefs.pos ?? defaultPos();
  const pos = { right: clamp(saved.right, EDGE, viewW() - size - EDGE), bottom: clamp(saved.bottom, EDGE, viewH() - size - EDGE) };
  const shift = docked && !fly && pos.right < 440 ? 432 : 0; // 给停靠的 AI 面板让位
  const onRightHalf = pos.right + shift < viewW() / 2;
  const nearTop = pos.bottom > viewH() - size - 220;

  // ---------- 交互 ----------
  const poke = () => {
    say(pick(POKE), { mood: "happy", ms: 2500 });
    play("jiggle");
  };
  const click = () => {
    lastActive.current = Date.now();
    if (asleep) {
      setAsleep(false);
      say("嗯…我醒啦", { ms: 2500 });
      play("jiggle");
      return;
    }
    hush();
    setMenu((m) => !m);
    play("jiggle");
  };
  const onPointerDown = (e: PointerEvent<HTMLButtonElement>) => {
    if (e.button !== 0) return;
    try {
      e.currentTarget.setPointerCapture(e.pointerId); // 触屏上拖出团子范围也继续跟着
    } catch {
      // 拿不到也没关系，移动和松手是在整个窗口上听的
    }
    const p = phys.current;
    // 还在飞的时候一把抓住：直接接着拖
    pointer.current = { id: e.pointerId, x: e.clientX, y: e.clientY, moved: !!p };
    if (p) {
      catchIt(p, e.clientX, e.clientY);
      aim(p, e.clientX, e.clientY, e.timeStamp, size);
      run();
    }
  };
  const startDrag = (e: globalThis.PointerEvent, from: { x: number; y: number }) => {
    const el = root.current;
    if (!el) return;
    const r = el.getBoundingClientRect();
    const p = createPhys(r.left, r.top, from.x - r.left, from.y - r.top);
    phys.current = p;
    // 出发点按现在看到的位置算（包括给 AI 面板让的那段），这样拿起来不会跳
    setFly({ right: viewW() - r.right, bottom: viewH() - r.bottom });
    setMenu(false);
    hush();
    aim(p, e.clientX, e.clientY, e.timeStamp, size);
    run();
  };
  handlers.current.move = (e) => {
    const pt = pointer.current;
    if (!pt || e.pointerId !== pt.id) return;
    if (!pt.moved) {
      if (Math.hypot(e.clientX - pt.x, e.clientY - pt.y) < 5) return; // 手抖一下不算拖
      pt.moved = true;
      startDrag(e, pt);
      return;
    }
    const p = phys.current;
    if (p) aim(p, e.clientX, e.clientY, e.timeStamp, size);
  };
  handlers.current.up = (e) => {
    const pt = pointer.current;
    if (!pt || e.pointerId !== pt.id) return;
    pointer.current = null;
    if (!pt.moved) return click();
    const p = phys.current;
    if (!p) return;
    release(p, e.timeStamp);
    run();
  };
  // 停稳了：把位置存起来，transform 换回 right/bottom
  finishRef.current = (p) => {
    phys.current = null;
    const el = root.current;
    const next = { right: Math.round(viewW() - p.x - size), bottom: Math.round(viewH() - p.y - size) };
    if (el) {
      // 同一帧里把 transform 换成新的 right/bottom；React 稍后写进去的是同样的值，不会闪
      el.style.right = `${next.right}px`;
      el.style.bottom = `${next.bottom}px`;
      unpaint(el, jelly.current, squash.current);
    }
    setPetPrefs({ pos: next });
    setFly(null);
    if (p.bumped > 1100) say(pick(BUMPED), { mood: "worried", ms: 2200 });
    else {
      if (p.mode === "settle") play("land");
      if (Math.random() < 0.4) say(pick(DROPPED), { ms: 2000 });
    }
  };
  const onKeyDown = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      click();
    }
  };
  const openAi = (which: OpenAi) => {
    setMenu(false);
    window.dispatchEvent(new CustomEvent<OpenAi>(OPEN_AI_EVENT, { detail: which }));
  };
  const goTo = (to: string) => {
    setMenu(false);
    hush();
    navigate(to);
  };
  const hide = () => {
    setMenu(false);
    setPetPrefs({ visible: false });
    toast(`${prefs.name}躲起来了`, { description: "想它了可以在「设置」里叫它回来", action: { label: "叫回来", onClick: () => setPetPrefs({ visible: true }) } });
  };

  const mood: Mood = asleep ? "sleep" : aiBusy > 0 ? "think" : (tempMood ?? "idle");
  const c = petPalette(prefs);
  // 气泡和菜单放在团子上方（太靠上时放下方），靠哪边对齐看团子在左半边还是右半边
  const float = `absolute ${nearTop ? "top-full mt-2" : "bottom-full mb-2"} ${onRightHalf ? "right-0" : "left-0"}`;

  return (
    <div ref={root} className={`fixed z-[45] ${asleep ? "pet-sleeping" : ""}`} style={{ right: pos.right + shift, bottom: pos.bottom, width: size, height: size, transition: fly ? "none" : "right .3s ease" }}>
      {bubble && !menu && (
        <div key={bubble.key} className={`pet-pop ${float} w-max max-w-[260px] text-pretty`}>
          <div className="glass-strong flex items-start gap-1.5 rounded-2xl py-2 pl-3 pr-1.5 text-sm leading-snug shadow-lg">
            {bubble.to ? (
              <button className="cursor-pointer text-left hover:underline hover:underline-offset-4" onClick={() => goTo(bubble.to!)}>
                {bubble.text}
              </button>
            ) : (
              <span className="pr-1.5">{bubble.text}</span>
            )}
            {(bubble.to || aiBusy === 0) && (
              <button className="-my-0.5 shrink-0 cursor-pointer rounded-md p-0.5 text-slate-400 hover:text-ink" onClick={hush} aria-label="关掉气泡">
                <X className="size-3.5" />
              </button>
            )}
          </div>
        </div>
      )}

      {menu && (
        <div role="menu" className={`pet-pop glass-strong ${float} w-64 rounded-2xl p-1.5 shadow-lg`}>
          <div className="px-2.5 pb-2 pt-1.5">
            <div className="flex items-center gap-2">
              <span className="text-sm font-semibold">{prefs.name}</span>
              {info && (
                <span className="rounded-md px-1.5 py-0.5 text-xs" style={{ backgroundColor: `${c.deep}26`, color: c.deep }}>
                  {info.stage.name}
                </span>
              )}
            </div>
            {info && (
              <p className="mt-1 text-xs leading-relaxed text-slate-500">
                连续记录 {info.streak} 天 · 一共记过 {info.totalDays} 天
                {info.stage.next && (
                  <>
                    <br />
                    再记 {info.stage.next.daysLeft} 天变成「{info.stage.next.name}」
                  </>
                )}
              </p>
            )}
            {/* AI 今天用了多少、还剩多少钱 */}
            {info?.ai && (
              <div
                className="mt-2 grid grid-cols-2 gap-1.5"
                title={`模型 ${info.ai.model}
今天：输入 ${info.ai.today.input.toLocaleString("zh-CN")}（其中命中缓存 ${info.ai.today.cached.toLocaleString("zh-CN")}）· 输出 ${info.ai.today.output.toLocaleString("zh-CN")} tokens`}
              >
                <div className="rounded-[10px] bg-ink/5 px-2.5 py-1.5">
                  <div className="flex items-center gap-1 text-[11px] text-slate-500">
                    <Sparkles className="size-3 text-brand" /> 今天 AI 用了
                  </div>
                  <div className="mt-0.5 text-sm font-semibold tabular-nums">
                    {fmtTokens(info.ai.today.total)} <span className="text-[11px] font-normal text-slate-500">tokens</span>
                  </div>
                  <div className="text-[11px] text-slate-500">{info.ai.today.calls ? `${info.ai.today.calls} 次` : "还没用过"}</div>
                </div>
                <div className="rounded-[10px] bg-ink/5 px-2.5 py-1.5">
                  <div className="text-[11px] text-slate-500">账户余额</div>
                  <div className={`mt-0.5 text-sm font-semibold tabular-nums ${info.ai.balance && info.ai.balance.amount < 1 ? "text-rose-500" : ""}`}>{info.ai.balance ? fmtMoney(info.ai.balance) : "—"}</div>
                  <div className="truncate text-[11px] text-slate-500">{info.ai.balance ? info.ai.model : "这家查不到余额"}</div>
                </div>
              </div>
            )}
          </div>
          {info && info.reminders.length > 0 && (
            <div className="mb-1 border-y border-line py-1">
              {info.reminders.map((r) => (
                <button key={r.id} role="menuitem" className="flex w-full cursor-pointer items-start gap-2 rounded-[10px] px-2.5 py-1.5 text-left text-xs leading-relaxed text-slate-600 transition hover:bg-ink/8 hover:text-ink" onClick={() => (r.to ? goTo(r.to) : setMenu(false))}>
                  <Bell className="mt-0.5 size-3.5 shrink-0 text-brand" />
                  {r.text}
                </button>
              ))}
            </div>
          )}
          {[
            ...(page ? [{ icon: MessageCircleQuestion, label: `${page.name}助手`, run: () => openAi("page") }] : [{ icon: MessageCircleQuestion, label: "问我的数据", run: () => openAi("ask") }]),
            { icon: PencilLine, label: "记一笔", run: () => openAi("capture") },
            { icon: Hand, label: "摸摸它", run: () => (setMenu(false), poke()) },
            { icon: EyeOff, label: "让它躲起来", run: hide },
          ].map((it) => (
            <button key={it.label} role="menuitem" className="flex w-full cursor-pointer items-center gap-2.5 rounded-[10px] px-2.5 py-2 text-left text-sm transition hover:bg-ink/8" onClick={it.run}>
              <it.icon className="size-4 shrink-0 text-brand" />
              {it.label}
            </button>
          ))}
        </div>
      )}

      <button
        className="size-full cursor-grab touch-none select-none rounded-full outline-offset-4 active:cursor-grabbing"
        aria-label={`${prefs.name}（桌宠）：点一下打开菜单，按住可以拖动`}
        aria-haspopup="menu"
        aria-expanded={menu}
        onPointerDown={onPointerDown}
        onKeyDown={onKeyDown}
      >
        {/* jelly：跑起来拉长、往前倾；squash：撞墙时贴着墙压扁再晃回来（都由 physics.ts 每帧写） */}
        <div ref={jelly} className="pet-jelly">
          <div ref={squash} className="pet-squash">
            <div key={anim?.key ?? 0} className={`pet-figure ${anim ? `pet-anim-${anim.name}` : ""}`} onAnimationEnd={(e) => e.target === e.currentTarget && setAnim(null)}>
              <Blob mood={mood} stage={level} palette={c} />
            </div>
          </div>
        </div>
      </button>
    </div>
  );
}
