/**
 * 内置的常见食物热量表，记饮食时用来快速选。
 * 数字是常见食物成分表里的大约值（同一种食物做法不同会差不少），只用来估算。
 *   per = "100g"  kcal 是每 100 克的热量，记的时候填克数
 *   per = 其他    kcal 是每一份（一个、一碗、一杯…）的热量，记的时候填份数；grams 是一份大约多少克，只用来显示
 * 想加食物：在下面加一行就行。
 */
export type Food = { name: string; kcal: number; per: "100g" | string; grams?: number; group: string };

export const FOODS: Food[] = [
  // 主食
  { group: "主食", name: "米饭", kcal: 116, per: "100g" },
  { group: "主食", name: "米饭（一碗）", kcal: 232, per: "碗", grams: 200 },
  { group: "主食", name: "馒头", kcal: 223, per: "个", grams: 100 },
  { group: "主食", name: "白粥", kcal: 46, per: "100g" },
  { group: "主食", name: "面条（煮熟）", kcal: 110, per: "100g" },
  { group: "主食", name: "全麦面包", kcal: 246, per: "100g" },
  { group: "主食", name: "吐司", kcal: 80, per: "片", grams: 30 },
  { group: "主食", name: "燕麦片（干）", kcal: 377, per: "100g" },
  { group: "主食", name: "玉米", kcal: 180, per: "根", grams: 200 },
  { group: "主食", name: "红薯", kcal: 86, per: "100g" },
  { group: "主食", name: "土豆", kcal: 81, per: "100g" },
  { group: "主食", name: "紫薯", kcal: 106, per: "100g" },
  { group: "主食", name: "包子（肉）", kcal: 230, per: "个", grams: 100 },
  { group: "主食", name: "饺子（猪肉）", kcal: 45, per: "个", grams: 20 },
  { group: "主食", name: "油条", kcal: 270, per: "根", grams: 70 },
  { group: "主食", name: "煎饼果子", kcal: 450, per: "个" },
  { group: "主食", name: "意大利面（煮熟）", kcal: 158, per: "100g" },

  // 肉蛋奶
  { group: "肉蛋奶", name: "鸡胸肉", kcal: 133, per: "100g" },
  { group: "肉蛋奶", name: "鸡腿肉（去皮）", kcal: 150, per: "100g" },
  { group: "肉蛋奶", name: "瘦牛肉", kcal: 125, per: "100g" },
  { group: "肉蛋奶", name: "牛排", kcal: 200, per: "100g" },
  { group: "肉蛋奶", name: "瘦猪肉", kcal: 143, per: "100g" },
  { group: "肉蛋奶", name: "五花肉", kcal: 395, per: "100g" },
  { group: "肉蛋奶", name: "排骨", kcal: 278, per: "100g" },
  { group: "肉蛋奶", name: "三文鱼", kcal: 190, per: "100g" },
  { group: "肉蛋奶", name: "虾", kcal: 93, per: "100g" },
  { group: "肉蛋奶", name: "鱼（草鱼 / 鲈鱼）", kcal: 110, per: "100g" },
  { group: "肉蛋奶", name: "鸡蛋", kcal: 72, per: "个", grams: 50 },
  { group: "肉蛋奶", name: "蛋白", kcal: 17, per: "个" },
  { group: "肉蛋奶", name: "牛奶（全脂）", kcal: 160, per: "盒 250ml" },
  { group: "肉蛋奶", name: "牛奶（脱脂）", kcal: 85, per: "盒 250ml" },
  { group: "肉蛋奶", name: "无糖酸奶", kcal: 70, per: "100g" },
  { group: "肉蛋奶", name: "豆浆（无糖）", kcal: 95, per: "杯 300ml" },
  { group: "肉蛋奶", name: "北豆腐", kcal: 98, per: "100g" },
  { group: "肉蛋奶", name: "蛋白粉", kcal: 120, per: "勺", grams: 30 },

  // 蔬菜
  { group: "蔬菜", name: "西兰花", kcal: 34, per: "100g" },
  { group: "蔬菜", name: "生菜", kcal: 15, per: "100g" },
  { group: "蔬菜", name: "黄瓜", kcal: 16, per: "100g" },
  { group: "蔬菜", name: "番茄", kcal: 18, per: "100g" },
  { group: "蔬菜", name: "菠菜", kcal: 28, per: "100g" },
  { group: "蔬菜", name: "白菜", kcal: 17, per: "100g" },
  { group: "蔬菜", name: "胡萝卜", kcal: 39, per: "100g" },
  { group: "蔬菜", name: "蘑菇", kcal: 24, per: "100g" },
  { group: "蔬菜", name: "清炒时蔬（一份）", kcal: 120, per: "份" },
  { group: "蔬菜", name: "蔬菜沙拉（少酱）", kcal: 150, per: "份" },

  // 水果
  { group: "水果", name: "苹果", kcal: 95, per: "个", grams: 180 },
  { group: "水果", name: "香蕉", kcal: 105, per: "根", grams: 120 },
  { group: "水果", name: "橙子", kcal: 62, per: "个", grams: 130 },
  { group: "水果", name: "葡萄", kcal: 69, per: "100g" },
  { group: "水果", name: "西瓜", kcal: 31, per: "100g" },
  { group: "水果", name: "草莓", kcal: 32, per: "100g" },
  { group: "水果", name: "蓝莓", kcal: 57, per: "100g" },
  { group: "水果", name: "猕猴桃", kcal: 45, per: "个", grams: 75 },
  { group: "水果", name: "牛油果", kcal: 160, per: "半个", grams: 100 },

  // 家常菜和外卖
  { group: "家常菜和外卖", name: "番茄炒蛋", kcal: 220, per: "份" },
  { group: "家常菜和外卖", name: "宫保鸡丁", kcal: 400, per: "份" },
  { group: "家常菜和外卖", name: "鱼香肉丝", kcal: 420, per: "份" },
  { group: "家常菜和外卖", name: "红烧肉", kcal: 550, per: "份" },
  { group: "家常菜和外卖", name: "麻婆豆腐", kcal: 300, per: "份" },
  { group: "家常菜和外卖", name: "青椒肉丝", kcal: 320, per: "份" },
  { group: "家常菜和外卖", name: "蛋炒饭", kcal: 600, per: "份" },
  { group: "家常菜和外卖", name: "牛肉面", kcal: 550, per: "碗" },
  { group: "家常菜和外卖", name: "麻辣烫（一份）", kcal: 500, per: "份" },
  { group: "家常菜和外卖", name: "黄焖鸡米饭", kcal: 750, per: "份" },
  { group: "家常菜和外卖", name: "盖浇饭", kcal: 700, per: "份" },
  { group: "家常菜和外卖", name: "汉堡", kcal: 500, per: "个" },
  { group: "家常菜和外卖", name: "薯条（中份）", kcal: 340, per: "份" },
  { group: "家常菜和外卖", name: "炸鸡", kcal: 250, per: "块" },
  { group: "家常菜和外卖", name: "披萨", kcal: 270, per: "片" },
  { group: "家常菜和外卖", name: "寿司", kcal: 45, per: "个" },
  { group: "家常菜和外卖", name: "三明治", kcal: 350, per: "个" },
  { group: "家常菜和外卖", name: "轻食沙拉（鸡胸）", kcal: 380, per: "份" },

  // 零食饮料
  { group: "零食饮料", name: "可乐", kcal: 140, per: "罐 330ml" },
  { group: "零食饮料", name: "奶茶（全糖）", kcal: 450, per: "杯" },
  { group: "零食饮料", name: "奶茶（无糖）", kcal: 250, per: "杯" },
  { group: "零食饮料", name: "美式咖啡", kcal: 5, per: "杯" },
  { group: "零食饮料", name: "拿铁", kcal: 180, per: "杯" },
  { group: "零食饮料", name: "啤酒", kcal: 140, per: "罐 330ml" },
  { group: "零食饮料", name: "果汁", kcal: 115, per: "杯 250ml" },
  { group: "零食饮料", name: "坚果", kcal: 600, per: "100g" },
  { group: "零食饮料", name: "坚果（一小把）", kcal: 150, per: "把", grams: 25 },
  { group: "零食饮料", name: "薯片", kcal: 540, per: "100g" },
  { group: "零食饮料", name: "巧克力", kcal: 550, per: "100g" },
  { group: "零食饮料", name: "饼干", kcal: 480, per: "100g" },
  { group: "零食饮料", name: "蛋糕", kcal: 350, per: "块" },
  { group: "零食饮料", name: "冰淇淋", kcal: 200, per: "个" },
  { group: "零食饮料", name: "食用油", kcal: 90, per: "勺 10g" },
];

/** 按 100 克计的食物记多少克、按份计的记多少份，算出热量 */
export function foodKcal(food: Food, qty: number): number {
  return Math.round(food.per === "100g" ? (food.kcal * qty) / 100 : food.kcal * qty);
}

/** 分量的文字：150 克 / 2 个 */
export function foodAmount(food: Food, qty: number): string {
  if (food.per === "100g") return `${qty} 克`;
  const unit = food.per.split(" ")[0];
  return `${qty} ${unit}`;
}
