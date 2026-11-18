/** 桌宠会说的话 */
export const pick = <T,>(list: T[]): T => list[Math.floor(Math.random() * list.length)];

/** 被戳的时候 */
export const POKE = ["嘿嘿", "痒～", "别戳啦", "咕噜咕噜", "我是果冻做的！", "Q 弹吧？", "再戳就要化掉啦", "(｡･ω･｡)", "噗叽"];

/** 打招呼：按时间段 */
export function greeting(name: string): string {
  const h = new Date().getHours();
  if (h < 5) return `这么晚还没睡呀…${name}陪你一会儿`;
  if (h < 11) return pick(["早上好！今天也一起加油", "早～睡得好吗？", "新的一天开始啦"]);
  if (h < 14) return pick(["中午好！记得吃饭哦", "午饭吃了什么？"]);
  if (h < 18) return pick(["下午好，喝口水歇一歇", "下午容易犯困，起来走走吧"]);
  if (h < 23) return pick(["晚上好！今天过得怎么样？", "辛苦啦，今天的事做完了吗？"]);
  return pick(["不早了，早点休息吧", "该睡觉啦，明天再忙"]);
}

/** AI 写完了 */
export const AI_DONE = ["好啦！", "写好了～", "搞定！", "看看我找到了什么"];

/** 你刚记了一条 */
export const celebrate = (n: number) => (n === 1 ? pick(["今天第一条，开张啦！", "记下来啦，今天的第一条～"]) : pick([`记下来啦！今天第 ${n} 条`, `收到～今天已经 ${n} 条了`, "好耶，又记了一条"]));

/** 连续记录到了某个天数 */
export const STREAK_MILESTONES = [3, 7, 14, 30, 60, 100, 200, 365];
export const streakLine = (days: number) => `连续记录 ${days} 天了，好厉害！`;

/** 长大了 */
export const grewUp = (stage: string) => `我长大了！现在是「${stage}」`;

/** 被拖着走 / 放下 */
export const DROPPED = ["呼～到了", "这里不错", "晕乎乎…", "放稳啦"];

/** 被甩出去狠狠撞了墙 */
export const BUMPED = ["哎哟！", "咚——撞到了", "眼冒金星…", "再来一次！", "好晕好晕"];
