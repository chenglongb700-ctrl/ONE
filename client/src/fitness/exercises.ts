/**
 * 运动类型和它的强度系数（MET）：消耗的热量 ≈ MET × 体重(kg) × 小时数。
 * MET 是通用的参考值，同一种运动强度不同差别很大，所以算出来的只是估计，可以手动改成手环上的数字。
 */
export const WORKOUT_TYPES: { name: string; met: number }[] = [
  { name: "跑步", met: 9 },
  { name: "慢跑", met: 7 },
  { name: "快走", met: 4.3 },
  { name: "散步", met: 3 },
  { name: "骑行", met: 6.8 },
  { name: "游泳", met: 7 },
  { name: "跳绳", met: 11 },
  { name: "力量训练", met: 5 },
  { name: "HIIT", met: 8 },
  { name: "椭圆机", met: 5 },
  { name: "爬楼 / 登山", met: 7 },
  { name: "瑜伽", met: 2.8 },
  { name: "跳操", met: 6.5 },
  { name: "篮球", met: 6.5 },
  { name: "羽毛球", met: 5.5 },
  { name: "足球", met: 7 },
  { name: "其他", met: 4 },
];

export const metOf = (type: string) => WORKOUT_TYPES.find((t) => t.name === type)?.met ?? 4;

/** 内置的常见力量动作，记力量训练时可以直接选，也可以自己填别的 */
export const STRENGTH_EXERCISES = [
  "深蹲",
  "卧推",
  "硬拉",
  "引体向上",
  "俯卧撑",
  "杠铃划船",
  "哑铃划船",
  "推举",
  "哑铃卧推",
  "高位下拉",
  "坐姿划船",
  "腿举",
  "箭步蹲",
  "罗马尼亚硬拉",
  "臀推",
  "腿弯举",
  "腿屈伸",
  "哑铃飞鸟",
  "侧平举",
  "二头弯举",
  "三头下压",
  "平板支撑",
  "卷腹",
];
