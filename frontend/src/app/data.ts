export interface RecipeStep {
  text: string;
  needTimer?: boolean;
  time?: number; // in seconds
  hint?: string;
}

export interface Ingredient {
  name: string;
  amount: string;
  category?: '蔬菜' | '肉类' | '调料' | '主食';
}

export interface Recipe {
  id: string;
  title: string;
  cover: string;
  time: number;
  difficulty: number;
  servings: number;
  ingredientsReady: boolean;
  tags: string[];
  ingredients: Ingredient[];
  steps: RecipeStep[];
}

export const recipes: Recipe[] = [
  {
    id: "1",
    title: "酱香宫保鸡丁",
    cover: "https://images.unsplash.com/photo-1702705487239-10a1ca715454?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwZm9vZCUyMGNoaWNrZW58ZW58MXx8fHwxNzc0NDA3NjAxfDA&ixlib=rb-4.1.0&q=80&w=1080",
    time: 15,
    difficulty: 2,
    servings: 2,
    ingredientsReady: true,
    tags: ["15分钟快手", "下饭", "家常菜"],
    ingredients: [
      { name: "鸡腿肉", amount: "250g", category: "肉类" },
      { name: "花生米", amount: "50g", category: "蔬菜" },
      { name: "干辣椒", amount: "10g", category: "调料" },
      { name: "大葱", amount: "1根", category: "蔬菜" },
      { name: "生抽", amount: "2勺", category: "调料" },
    ],
    steps: [
      { text: "鸡腿肉切丁，加生抽、料酒、淀粉抓匀，腌制10分钟。", needTimer: true, time: 600, hint: "腌制能让肉质更嫩" },
      { text: "热锅凉油，下花生米炸至酥脆，捞出备用。", needTimer: false, hint: "注意火候，不要糊了" },
      { text: "锅留底油，下干辣椒、花椒爆香。", needTimer: false },
      { text: "下鸡丁滑炒至变色。", needTimer: false, hint: "表面微黄即可" },
      { text: "加入葱姜蒜炒香，倒入调好的料汁翻炒均匀。", needTimer: false },
      { text: "最后加入炸好的花生米，快速翻匀出锅。", needTimer: false }
    ]
  },
  {
    id: "2",
    title: "轻食鸡胸肉藜麦沙拉",
    cover: "https://images.unsplash.com/photo-1540420773420-3366772f4999?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwc2FsYWR8ZW58MXx8fHwxNzc0MzUxMjA3fDA&ixlib=rb-4.1.0&q=80&w=1080",
    time: 10,
    difficulty: 1,
    servings: 1,
    ingredientsReady: false,
    tags: ["减脂", "低卡", "清淡"],
    ingredients: [
      { name: "鸡胸肉", amount: "150g", category: "肉类" },
      { name: "综合生菜", amount: "100g", category: "蔬菜" },
      { name: "圣女果", amount: "5颗", category: "蔬菜" },
      { name: "油醋汁", amount: "2勺", category: "调料" },
    ],
    steps: [
      { text: "鸡胸肉表面划刀，加少许盐和黑胡椒煎熟。", needTimer: true, time: 300 },
      { text: "蔬菜洗净沥干水分，圣女果对半切开。", needTimer: false },
      { text: "将煎好的鸡胸肉切块，和蔬菜混合，淋上油醋汁即可。", needTimer: false }
    ]
  },
  {
    id: "3",
    title: "元气火腿芝士吐司",
    cover: "https://images.unsplash.com/photo-1689020353604-8041221e1273?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicmVha2Zhc3QlMjB0b2FzdHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080",
    time: 5,
    difficulty: 1,
    servings: 1,
    ingredientsReady: true,
    tags: ["早餐", "快手菜", "零失败"],
    ingredients: [
      { name: "吐司", amount: "2片", category: "主食" },
      { name: "火腿片", amount: "2片", category: "肉类" },
      { name: "芝士片", amount: "1片", category: "调料" },
      { name: "鸡蛋", amount: "1个", category: "肉类" },
    ],
    steps: [
      { text: "平底锅少油，打入一个鸡蛋煎至七分熟。", needTimer: true, time: 120 },
      { text: "吐司表面稍微烘烤至微黄。", needTimer: false },
      { text: "一层吐司、一层火腿、一层芝士、一层鸡蛋，再盖上一层吐司即可。", needTimer: false }
    ]
  },
  {
    id: "4",
    title: "暖胃排骨玉米汤",
    cover: "https://images.unsplash.com/photo-1708410262792-74d07c9f2581?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YXJtJTIwc291cHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080",
    time: 60,
    difficulty: 2,
    servings: 3,
    ingredientsReady: false,
    tags: ["汤粥", "周末大菜", "滋补"],
    ingredients: [
      { name: "排骨", amount: "500g", category: "肉类" },
      { name: "甜玉米", amount: "1根", category: "蔬菜" },
      { name: "胡萝卜", amount: "1根", category: "蔬菜" },
      { name: "生姜", amount: "3片", category: "调料" },
    ],
    steps: [
      { text: "排骨冷水下锅，加料酒焯水去血沫，捞出洗净。", needTimer: true, time: 180 },
      { text: "玉米切段，胡萝卜切滚刀块。", needTimer: false },
      { text: "将排骨、玉米、胡萝卜放入砂锅，加足量清水。", needTimer: false },
      { text: "大火煮开后转小火慢炖40分钟。", needTimer: true, time: 2400 },
      { text: "出锅前加少许盐调味即可。", needTimer: false }
    ]
  }
];

export const weeklyPlan = [
  { day: "周一", meal: "晚餐", recipeId: "1" },
  { day: "周二", meal: "早餐", recipeId: "3" },
  { day: "周三", meal: "晚餐", recipeId: "2" },
];
