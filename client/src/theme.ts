import { useSyncExternalStore } from "react";

/**
 * 外观设置，全部存在本浏览器的 localStorage 里：
 *   主题     system（跟随系统）/ light / dark  → <html data-theme="light|dark">
 *   强调色   cobalt（默认）等几种              → <html data-accent="...">
 *   玻璃     侧边栏和播放条有多实（百分比）      → <html style="--glass-fill: 38%">
 * index.css 根据这些属性切换变量。index.html 里有一小段脚本在页面渲染前先设置好，避免闪一下。
 */
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";
export type Accent = "cobalt" | "teal" | "orange" | "rose" | "violet";

/** 设置里的色板：名字和浅色下的色值（深色下的色值在 index.css） */
export const ACCENTS: Record<Accent, { name: string; swatch: string }> = {
  cobalt: { name: "钴蓝", swatch: "#2452d6" },
  teal: { name: "青", swatch: "#0b7d84" },
  orange: { name: "暖橙", swatch: "#c2570c" },
  rose: { name: "玫瑰红", swatch: "#cf3360" },
  violet: { name: "紫罗兰", swatch: "#6d4bd8" },
};

/** 玻璃通透度滑块的范围：数值是不透明度，越小越透 */
export const GLASS_RANGE = { min: 15, max: 85 };

const THEME_KEY = "one-theme";
const LOOK_KEY = "one-look";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

function readLook(): { accent: Accent; glass: number | null } {
  try {
    const v = JSON.parse(localStorage.getItem(LOOK_KEY) || "{}");
    return {
      accent: v.accent in ACCENTS ? v.accent : "cobalt",
      glass: typeof v.glass === "number" && v.glass >= GLASS_RANGE.min && v.glass <= GLASS_RANGE.max ? v.glass : null,
    };
  } catch {
    return { accent: "cobalt", glass: null };
  }
}

let pref: ThemePref = readPref();
let { accent, glass } = readLook();
const resolved = (): Theme => (pref === "system" ? (mq.matches ? "dark" : "light") : pref);

function apply() {
  const root = document.documentElement;
  root.dataset.theme = resolved();
  if (accent === "cobalt") delete root.dataset.accent;
  else root.dataset.accent = accent;
  if (glass === null) root.style.removeProperty("--glass-fill");
  else root.style.setProperty("--glass-fill", `${glass}%`);
  listeners.forEach((fn) => fn());
}
mq.addEventListener("change", apply);
apply();

function saveLook() {
  try {
    if (accent === "cobalt" && glass === null) localStorage.removeItem(LOOK_KEY);
    else localStorage.setItem(LOOK_KEY, JSON.stringify({ accent, glass }));
  } catch {
    /* 存不了就只在本次访问生效 */
  }
}

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === "system") localStorage.removeItem(THEME_KEY);
    else localStorage.setItem(THEME_KEY, next);
  } catch {
    /* 同上 */
  }
  apply();
}

export function setAccent(next: Accent) {
  accent = next;
  saveLook();
  apply();
}

/** 传 null 恢复成主题自带的默认值 */
export function setGlass(next: number | null) {
  glass = next === null ? null : Math.max(GLASS_RANGE.min, Math.min(GLASS_RANGE.max, Math.round(next)));
  saveLook();
  apply();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useTheme(): { pref: ThemePref; theme: Theme; accent: Accent; glass: number | null } {
  const snap = useSyncExternalStore(subscribe, () => `${pref}:${resolved()}:${accent}:${glass ?? ""}`);
  const [p, t, a, g] = snap.split(":");
  return { pref: p as ThemePref, theme: t as Theme, accent: a as Accent, glass: g === "" ? null : Number(g) };
}
