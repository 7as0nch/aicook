-- Demo recipes aligned with aidesign data.ts (4 dishes).
-- Household / user from base.sql: household 202503240000001001, user 202503240000001002.
-- Recipe ids: 202503250000001011–014 (see comments per block).
SET search_path TO aicook, public;

-- 202503250000001011 酱香宫保鸡丁
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001011,
  202503240000001001,
  202503240000001002,
  '酱香宫保鸡丁',
  '',
  'https://images.unsplash.com/photo-1702705487239-10a1ca715454?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxjaGluZXNlJTIwZm9vZCUyMGNoaWNrZW58ZW58MXx8fHwxNzc0NDA3NjAxfDA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '家常菜',
  15,
  2,
  '["15分钟快手","下饭","家常菜"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":2,"ingredients_ready":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251101001, 202503250000001011, 0, '肉类', '鸡腿肉', '250g', ''),
  (202503251101002, 202503250000001011, 1, '蔬菜', '花生米', '50g', ''),
  (202503251101003, 202503250000001011, 2, '调料', '干辣椒', '10g', ''),
  (202503251101004, 202503250000001011, 3, '蔬菜', '大葱', '1根', ''),
  (202503251101005, 202503250000001011, 4, '调料', '生抽', '2勺', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (
  id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint
)
VALUES
  (202503251102001, 202503250000001011, 1, '', '鸡腿肉切丁，加生抽、料酒、淀粉抓匀，腌制10分钟。', TRUE, 600, '腌制能让肉质更嫩'),
  (202503251102002, 202503250000001011, 2, '', '热锅凉油，下花生米炸至酥脆，捞出备用。', FALSE, 0, '注意火候，不要糊了'),
  (202503251102003, 202503250000001011, 3, '', '锅留底油，下干辣椒、花椒爆香。', FALSE, 0, ''),
  (202503251102004, 202503250000001011, 4, '', '下鸡丁滑炒至变色。', FALSE, 0, '表面微黄即可'),
  (202503251102005, 202503250000001011, 5, '', '加入葱姜蒜炒香，倒入调好的料汁翻炒均匀。', FALSE, 0, ''),
  (202503251102006, 202503250000001011, 6, '', '最后加入炸好的花生米，快速翻匀出锅。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001012 轻食鸡胸肉藜麦沙拉
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001012,
  202503240000001001,
  202503240000001002,
  '轻食鸡胸肉藜麦沙拉',
  '',
  'https://images.unsplash.com/photo-1540420773420-3366772f4999?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxoZWFsdGh5JTIwc2FsYWR8ZW58MXx8fHwxNzc0MzUxMjA3fDA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '清淡',
  10,
  1,
  '["减脂","低卡","清淡"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":1,"ingredients_ready":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251201001, 202503250000001012, 0, '肉类', '鸡胸肉', '150g', ''),
  (202503251201002, 202503250000001012, 1, '蔬菜', '综合生菜', '100g', ''),
  (202503251201003, 202503250000001012, 2, '蔬菜', '圣女果', '5颗', ''),
  (202503251201004, 202503250000001012, 3, '调料', '油醋汁', '2勺', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251202001, 202503250000001012, 1, '', '鸡胸肉表面划刀，加少许盐和黑胡椒煎熟。', TRUE, 300, ''),
  (202503251202002, 202503250000001012, 2, '', '蔬菜洗净沥干水分，圣女果对半切开。', FALSE, 0, ''),
  (202503251202003, 202503250000001012, 3, '', '将煎好的鸡胸肉切块，和蔬菜混合，淋上油醋汁即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001013 元气火腿芝士吐司
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001013,
  202503240000001001,
  202503240000001002,
  '元气火腿芝士吐司',
  '',
  'https://images.unsplash.com/photo-1689020353604-8041221e1273?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHxicmVha2Zhc3QlMjB0b2FzdHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '早餐',
  5,
  1,
  '["早餐","快手菜","零失败"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":1,"ingredients_ready":true}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251301001, 202503250000001013, 0, '主食', '吐司', '2片', ''),
  (202503251301002, 202503250000001013, 1, '肉类', '火腿片', '2片', ''),
  (202503251301003, 202503250000001013, 2, '调料', '芝士片', '1片', ''),
  (202503251301004, 202503250000001013, 3, '肉类', '鸡蛋', '1个', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251302001, 202503250000001013, 1, '', '平底锅少油，打入一个鸡蛋煎至七分熟。', TRUE, 120, ''),
  (202503251302002, 202503250000001013, 2, '', '吐司表面稍微烘烤至微黄。', FALSE, 0, ''),
  (202503251302003, 202503250000001013, 3, '', '一层吐司、一层火腿、一层芝士、一层鸡蛋，再盖上一层吐司即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;

-- 202503250000001014 暖胃排骨玉米汤
INSERT INTO recipes (
  id, household_id, owner_user_id, title, summary, cover_image_url, status, source_type,
  category, total_minutes, difficulty, scenario_tags, flavor_tags, tools, metadata_json
)
VALUES (
  202503250000001014,
  202503240000001001,
  202503240000001002,
  '暖胃排骨玉米汤',
  '',
  'https://images.unsplash.com/photo-1708410262792-74d07c9f2581?crop=entropy&cs=tinysrgb&fit=max&fm=jpg&ixid=M3w3Nzg4Nzd8MHwxfHNlYXJjaHwxfHx3YXJtJTIwc291cHxlbnwxfHx8fDE3NzQ0MDc2MDN8MA&ixlib=rb-4.1.0&q=80&w=1080',
  'published',
  'seed',
  '汤粥',
  60,
  2,
  '["汤粥","周末大菜","滋补"]'::jsonb,
  '[]'::jsonb,
  '[]'::jsonb,
  '{"servings":3,"ingredients_ready":false}'::jsonb
)
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_ingredients (id, recipe_id, sort_order, group_name, name, amount_text, preparation)
VALUES
  (202503251401001, 202503250000001014, 0, '肉类', '排骨', '500g', ''),
  (202503251401002, 202503250000001014, 1, '蔬菜', '甜玉米', '1根', ''),
  (202503251401003, 202503250000001014, 2, '蔬菜', '胡萝卜', '1根', ''),
  (202503251401004, 202503250000001014, 3, '调料', '生姜', '3片', '')
ON CONFLICT (id) DO NOTHING;

INSERT INTO recipe_steps (id, recipe_id, step_no, title, description, need_timer, timer_seconds, ai_hint)
VALUES
  (202503251402001, 202503250000001014, 1, '', '排骨冷水下锅，加料酒焯水去血沫，捞出洗净。', TRUE, 180, ''),
  (202503251402002, 202503250000001014, 2, '', '玉米切段，胡萝卜切滚刀块。', FALSE, 0, ''),
  (202503251402003, 202503250000001014, 3, '', '将排骨、玉米、胡萝卜放入砂锅，加足量清水。', FALSE, 0, ''),
  (202503251402004, 202503250000001014, 4, '', '大火煮开后转小火慢炖40分钟。', TRUE, 2400, ''),
  (202503251402005, 202503250000001014, 5, '', '出锅前加少许盐调味即可。', FALSE, 0, '')
ON CONFLICT (id) DO NOTHING;
