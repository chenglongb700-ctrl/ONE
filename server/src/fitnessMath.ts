/**
 * 减脂用到的几个估算公式。
 * 这个文件在前端有一份一模一样的（client/src/fitness/math.ts），改的时候两边一起改，
 * 这样页面上显示的数字和交给 AI 的数字是一致的。
 * 都是通用的估算，不是医疗建议。
 */
export type Sex = "male" | "female";
export type Activity = "sedentary" | "light" | "moderate" | "active";
export type Profile = {
  sex: Sex;
  birth_year: number;
  height_cm: number;
  activity: Activity;
  /** 目标体重 kg */
  target_weight: number;
  /** 每周想减多少 kg */
  weekly_loss: number;
};

/** 平时的活动量 → 每日总消耗是基础代谢的几倍 */
export const ACTIVITY: Record<Activity, { label: string; hint: string; factor: number }> = {
  sedentary: { label: "久坐", hint: "基本坐着，很少运动", factor: 1.2 },
  light: { label: "轻度", hint: "每周运动 1–3 次", factor: 1.375 },
  moderate: { label: "中度", hint: "每周运动 3–5 次", factor: 1.55 },
  active: { label: "高强度", hint: "每周运动 6–7 次，或体力工作", factor: 1.725 },
};

/** 减掉 1 公斤脂肪大约要少摄入 7700 千卡 */
export const KCAL_PER_KG = 7700;
/** 每日摄入的安全下限（千卡）：算出来比这低就按这个给 */
export const INTAKE_FLOOR: Record<Sex, number> = { male: 1500, female: 1200 };

export type Plan = {
  age: number;
  /** 基础代谢：躺着不动一天消耗的热量（Mifflin-St Jeor 公式） */
  bmr: number;
  /** 每日总消耗 = 基础代谢 × 活动系数 */
  tdee: number;
  /** 建议每日摄入 */
  intake: number;
  /** 建议摄入是不是被安全下限拦住了（说明减重速度定得太快） */
  capped: boolean;
  bmi: number;
};

export function plan(p: Profile, weight: number, year = new Date().getFullYear()): Plan {
  const age = Math.max(10, year - p.birth_year);
  const bmr = 10 * weight + 6.25 * p.height_cm - 5 * age + (p.sex === "male" ? 5 : -161);
  const tdee = bmr * ACTIVITY[p.activity].factor;
  const wanted = tdee - (p.weekly_loss * KCAL_PER_KG) / 7;
  const floor = INTAKE_FLOOR[p.sex];
  const h = p.height_cm / 100;
  return { age, bmr: Math.round(bmr), tdee: Math.round(tdee), intake: Math.round(Math.max(wanted, floor)), capped: wanted < floor, bmi: Math.round((weight / (h * h)) * 10) / 10 };
}

/** BMI 属于哪一档（中国成人标准） */
export function bmiLabel(bmi: number): string {
  if (bmi < 18.5) return "偏瘦";
  if (bmi < 24) return "正常";
  if (bmi < 28) return "超重";
  return "肥胖";
}

/** 按每周减重目标，还要多少天到目标体重；已经到了返回 0，没设减重速度返回 null */
export function daysToGoal(weight: number, target: number, weeklyLoss: number): number | null {
  if (weight <= target) return 0;
  if (weeklyLoss <= 0) return null;
  return Math.ceil(((weight - target) / weeklyLoss) * 7);
}

/** 运动消耗的热量 = MET × 体重(kg) × 小时数 */
export const burned = (met: number, weight: number, minutes: number) => Math.round(met * weight * (minutes / 60));
