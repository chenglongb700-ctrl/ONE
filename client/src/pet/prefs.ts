import { useSyncExternalStore } from "react";

/**
 * 桌宠的个人设置：显不显示、叫什么、什么颜色、多大、放在哪。
 * 存在这台电脑的浏览器里（localStorage），换台电脑就是默认的样子——都是些无关紧要的偏好，不值得存服务器。
 */
export type PetColor = "mint" | "peach" | "grape" | "lemon" | "sky" | "sakura" | "cocoa" | "cloud" | "custom";
export type PetPalette = { light: string; deep: string };
export const PET_COLORS: Record<Exclude<PetColor, "custom">, PetPalette & { name: string }> = {
  mint: { name: "薄荷", light: "#b5f0e1", deep: "#3fb59a" },
  peach: { name: "蜜桃", light: "#ffd9cc", deep: "#ef8466" },
  grape: { name: "葡萄", light: "#e0d3ff", deep: "#8b6cf0" },
  lemon: { name: "柠檬", light: "#fff1bd", deep: "#e9b62c" },
  sky: { name: "天空", light: "#cfe8ff", deep: "#4a95e8" },
  sakura: { name: "樱花", light: "#ffdbe8", deep: "#ec6f9c" },
  cocoa: { name: "可可", light: "#ecd5c3", deep: "#a0694a" },
  cloud: { name: "云朵", light: "#ffffff", deep: "#aab4c4" },
};

/** 大小：相对默认大小的倍数（成长阶段带来的变大会再乘上去） */
export const PET_SCALE = { min: 0.6, max: 1.6, step: 0.1 } as const;

const HEX = /^#[0-9a-f]{6}$/i;
/** 把颜色往白色里调：t=0 原色，t=1 纯白 */
function tint(hex: string, t: number) {
  const n = parseInt(hex.slice(1), 16);
  const ch = (shift: number) => {
    const v = (n >> shift) & 255;
    return Math.round(v + (255 - v) * t);
  };
  return `#${[16, 8, 0].map((s) => ch(s).toString(16).padStart(2, "0")).join("")}`;
}
/** 实际用的两种颜色。自己挑的颜色当深色，再调出一个浅色放在高光那一侧 */
export function petPalette(p: Pick<PetPrefs, "color" | "customColor">): PetPalette {
  if (p.color === "custom") return { light: tint(p.customColor, 0.65), deep: p.customColor };
  return PET_COLORS[p.color];
}

/** 位置：离窗口右边、下边各多少像素（null = 默认位置：右下角，播放条上方） */
export type PetPos = { right: number; bottom: number };
export type PetPrefs = { visible: boolean; name: string; color: PetColor; customColor: string; scale: number; pos: PetPos | null };

const KEY = "one.pet";
const EVENT = "one:pet-prefs";
const DEFAULTS: PetPrefs = { visible: true, name: "团团", color: "mint", customColor: "#3fb59a", scale: 1, pos: null };

let cache: PetPrefs | null = null;
function read(): PetPrefs {
  if (cache) return cache;
  let saved: Partial<PetPrefs> = {};
  try {
    saved = JSON.parse(localStorage.getItem(KEY) ?? "{}");
  } catch {
    // 读不到（隐私模式、被清掉了）就用默认的
  }
  cache = { ...DEFAULTS, ...saved };
  if (typeof cache.customColor !== "string" || !HEX.test(cache.customColor)) cache.customColor = DEFAULTS.customColor;
  if (cache.color !== "custom" && !(cache.color in PET_COLORS)) cache.color = "mint";
  if (typeof cache.scale !== "number" || !Number.isFinite(cache.scale)) cache.scale = 1;
  cache.scale = Math.min(Math.max(cache.scale, PET_SCALE.min), PET_SCALE.max);
  if (!cache.name?.trim()) cache.name = DEFAULTS.name;
  return cache;
}

export function setPetPrefs(patch: Partial<PetPrefs>) {
  cache = { ...read(), ...patch };
  try {
    localStorage.setItem(KEY, JSON.stringify(cache));
  } catch {
    // 存不下也没关系，这次打开期间还是生效的
  }
  window.dispatchEvent(new Event(EVENT));
}

const subscribe = (cb: () => void) => {
  window.addEventListener(EVENT, cb);
  return () => window.removeEventListener(EVENT, cb);
};
export const usePetPrefs = () => useSyncExternalStore(subscribe, read);

/** 这台电脑上的一点小记忆（今天打过招呼没有、哪些提醒今天已经说过了…），读写失败都当没有 */
export const memory = {
  get<T>(key: string, fallback: T): T {
    try {
      const raw = localStorage.getItem(`one.pet.${key}`);
      return raw === null ? fallback : (JSON.parse(raw) as T);
    } catch {
      return fallback;
    }
  },
  set(key: string, value: unknown) {
    try {
      localStorage.setItem(`one.pet.${key}`, JSON.stringify(value));
    } catch {
      // 忽略
    }
  },
};
