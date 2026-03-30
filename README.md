<!--
 * @Author: chengjiang
 * @Date: 2026-03-24 14:56:00
 * @Description: 
-->
# aicook
每天回家做饭不知道吃啥吗，上传自己喜欢的菜谱，每日不同推荐，并ai辅助指导。

# design tips
给我一套设计方案：我现在想做一个web软件：风格可以参考现有的美团外卖，其实我就是想做一款家里用的菜谱。背景是我每天下班回去都不知道吃啥，周末买菜也不知道买啥，最近想到自己开发一个web软件（支持pc，移动）,闲时在上面添加一些自己喜欢的菜谱或者ai通过互联网搜索你喜欢的菜谱添加进去（根据你的描述，抓取网页图片和内容教程等信息），后续做餐的时候点开对应菜谱就可以快速做餐，同时不会的步骤也可以询问ai，每一步都加一个倒计时的动画过度，具体菜谱可以参考github上的howtocook先引入一套。目前采用架构设计：后端：golang+ai框架eino，前端：vue3+ts+vite等，数据库使用pgsql。给我设计的时候给出数据模型struct我用于快速搭建项目。

# 技术架构
1. backend:
   1. golang 1.25.3
   2. kratos@latest 符合kratos编程习惯。
   3. ai: eino, https://www.cloudwego.io/zh/docs/eino/release_notes_and_migration/eino_v0.8._-adk_middlewares/
   4. db: postgresql, redis
   5. oss: minio (上传图片/文件需要), 桶是aicook
## 现有配置
```yaml
  pg_database:
    host: sshjd.aihelper.chat
    port: 30532
    user: pgadmin
    password: "pgcj123456"
    dbname: pgdb # schema: aicook
    sslmode: disable
  redis:
    addr: sshjd.aihelper.chat:30379
    read_timeout: 0.2s
    write_timeout: 0.2s
    password: "rediscj123456"

log:
  maxAge: 30
  level: "debug"
  format: "console"
  director: "./logs"
  encodeLevel: "CapitalColorLevelEncoder"

auth:
  qq:
    app_id: ""
    app_key: ""
    callback_url: ""
    frontend_redirect: "http://localhost:5173/chat"
    scope: "get_user_info"

# TODO minio 配置
oss:
  access_key: "7ns5yiCMFgN5rdZbkJnW"
  secret_key: "4GV4kNFqonmgFNlTkLMfK6R7ChCP4a63TFMIqHIx"
```

2. frontend:
   1. React + Vite + pnpm（`frontend/`，aidesign 风格路由与 UI）
   2. ts
   3. **未服务端持久化**：周菜单与购物清单、采购勾选与历史仅存浏览器（Zustand `persist`）；后端暂无 `meal_plan` / `shopping_list` 等 REST。演示菜谱可执行 `deploy/sql/seed_demo_recipes.sql`。
