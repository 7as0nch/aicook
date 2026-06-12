// 食材名 → emoji 映射（识别/推荐结果只有名称，前端兜底加 emoji 提高观感）。
// 子串匹配：键越靠前优先级越高（具体词放在泛化词前，如「胡萝卜」在「萝卜」前）。
const FOOD_EMOJI: Record<string, string> = {
  '番茄': '🍅', '西红柿': '🍅',
  '土豆': '🥔', '马铃薯': '🥔',
  '青椒': '🌶️', '辣椒': '🌶️',
  '鸡蛋': '🥚',
  '玉米': '🌽',
  '生菜': '🥬', '青菜': '🥬', '白菜': '🥬', '菠菜': '🥬', '油麦菜': '🥬',
  '五花肉': '🥩', '牛腩': '🥩', '猪肉': '🥩', '牛肉': '🥩', '羊肉': '🥩',
  '鸡肉': '🍗', '鸡翅': '🍗', '鸡腿': '🍗',
  '小葱': '🌿', '香葱': '🌿', '葱': '🌿', '香菜': '🌿',
  '大蒜': '🧄', '蒜': '🧄',
  '姜': '🫚',
  '胡萝卜': '🥕', '萝卜': '🥕',
  '鱼': '🐟',
  '虾': '🦐',
  '豆腐': '🍱',
  '蘑菇': '🍄', '香菇': '🍄', '金针菇': '🍄',
  '茄子': '🍆',
  '黄瓜': '🥒',
  '南瓜': '🎃',
  '洋葱': '🧅',
  '米饭': '🍚', '大米': '🍚',
  '面条': '🍜', '面粉': '🌾',
};

// 取食材对应 emoji；未命中返回 fallback（默认 🥗）
export function emojiFor(name: string, fallback = '🥗'): string {
  if (!name) return fallback;
  for (const k of Object.keys(FOOD_EMOJI)) {
    if (name.includes(k)) return FOOD_EMOJI[k];
  }
  return fallback;
}

// 冰箱分类（与库存页 tab key 对齐）
export type InvCategory = 'vegetable' | 'meat' | 'condiment' | 'other';

// 复用 emojiFor 的有序匹配：先拿到 emoji 再归类，避免再维护一套易错的关键词顺序。
const EMOJI_CATEGORY: Record<string, InvCategory> = {
  '🥩': 'meat', '🍗': 'meat', '🐟': 'meat', '🦐': 'meat', '🥚': 'meat',
  '🍅': 'vegetable', '🥔': 'vegetable', '🌶️': 'vegetable', '🌽': 'vegetable',
  '🥬': 'vegetable', '🥕': 'vegetable', '🍄': 'vegetable', '🍆': 'vegetable',
  '🥒': 'vegetable', '🎃': 'vegetable', '🧅': 'vegetable',
  '🧄': 'condiment', '🫚': 'condiment', '🌿': 'condiment',
  '🍚': 'other', '🍜': 'other', '🌾': 'other', '🍱': 'other',
};

// 按食材名归入冰箱分类；未命中归「其它」。
export function categoryFor(name: string): InvCategory {
  const e = emojiFor(name, '');
  return EMOJI_CATEGORY[e] || 'other';
}
