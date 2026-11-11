import { useSyncExternalStore } from "react";

/**
 * 主题：system（跟随系统）/ light / dark。
 * 真正生效的是 <html data-theme="light|dark">，index.css 里的变量根据它切换。
 * 手动选择存在 localStorage；index.html 里有一小段脚本在页面渲染前先设置好，避免闪一下白屏。
 */
export type ThemePref = "system" | "light" | "dark";
export type Theme = "light" | "dark";

const KEY = "one-theme";
const mq = window.matchMedia("(prefers-color-scheme: dark)");
const listeners = new Set<() => void>();

function readPref(): ThemePref {
  try {
    const v = localStorage.getItem(KEY);
    return v === "light" || v === "dark" ? v : "system";
  } catch {
    return "system";
  }
}

let pref: ThemePref = readPref();
const resolved = (): Theme => (pref === "system" ? (mq.matches ? "dark" : "light") : pref);

function apply() {
  document.documentElement.dataset.theme = resolved();
  listeners.forEach((fn) => fn());
}
mq.addEventListener("change", apply);
apply();

export function setThemePref(next: ThemePref) {
  pref = next;
  try {
    if (next === "system") localStorage.removeItem(KEY);
    else localStorage.setItem(KEY, next);
  } catch {
    /* 存不了就只在本次访问生效 */
  }
  apply();
}

const subscribe = (fn: () => void) => {
  listeners.add(fn);
  return () => listeners.delete(fn);
};

export function useTheme(): { pref: ThemePref; theme: Theme } {
  const snap = useSyncExternalStore(subscribe, () => `${pref}:${resolved()}`);
  const [p, t] = snap.split(":");
  return { pref: p as ThemePref, theme: t as Theme };
}
