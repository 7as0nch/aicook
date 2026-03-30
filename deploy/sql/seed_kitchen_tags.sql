-- 初始化系统内置的厨房标签 (tag_type = 1, household_id = 0)
-- 这些标签对所有用户可见，且不可删除

INSERT INTO kitchen_tags (id, household_id, name, icon, color, tag_type)
VALUES
  (100000000000000001, 0, '家常菜', 'home', 'orange', 1),
  (100000000000000002, 0, '快手菜', 'zap', 'amber', 1),
  (100000000000000003, 0, '下饭菜', 'utensils', 'stone', 1),
  (100000000000000004, 0, '早餐', 'coffee', 'yellow', 1),
  (100000000000000005, 0, '减脂餐', 'leaf', 'green', 1),
  (100000000000000006, 0, '硬菜', 'flame', 'red', 1),
  (100000000000000007, 0, '汤羹', 'droplet', 'blue', 1),
  (100000000000000008, 0, '烘焙', 'cake', 'pink', 1)
ON CONFLICT (household_id, name) DO NOTHING;
