import type { Profile } from "./math";

export type Measure = { date: string; value: number; firstDate: string; firstValue: number };

/** GET /fitness/overview 返回的内容：概览要用的所有汇总数字 */
export type Overview = {
  /** 个人资料；还没填时为 null */
  profile: Profile | null;
  /** 第一次记的体重（起始体重） */
  first: { date: string; weight: number } | null;
  /** 最近一次记的体重和围度 */
  latest: { date: string; weight: number; waist: number | null; body_fat: number | null } | null;
  /** 最近一次记的腰围（厘米），以及第一次记的（算变化用）；从没记过为 null */
  waist: Measure | null;
  /** 最近一次记的体脂率（%），同上 */
  bodyFat: Measure | null;
  /** 最近 180 天的体重 */
  weights: { date: string; weight: number }[];
  /** 今天吃进来的和运动消耗的千卡 */
  today: { date: string; eaten: number; burned: number };
  /** 本周（周一起）的运动：次数、分钟、消耗、有几天动了 */
  week: { count: number; minutes: number; kcal: number; days: number };
  /** 最近 14 天每天的摄入 */
  intake14: { date: string; kcal: number }[];
  /** 最近 8 周每周运动的分钟数，start 是那一周的周一 */
  workoutWeeks: { start: string; minutes: number }[];
};

/** 各个标签页共用的东西：汇总数据，和"我改了记录，重新读一下汇总"的函数 */
export type TabProps = { overview: Overview; reload: () => void };

export const num = (s: string) => (s.trim() === "" ? null : Number(s));
