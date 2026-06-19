<!--
 * @Author: chengjiang
 * @Date: 2026-03-24 14:56:00
 * @Description: 
-->
# aicook
每天回家做饭不知道吃啥吗，上传自己喜欢的菜谱，每日不同推荐，并ai辅助指导。

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
    host: <your-host>
    port: 30532
    user: pgadmin
    password: "<your-pg-password>"
    dbname: pgdb # schema: aicook
    sslmode: disable
  redis:
    addr: <your-host>:30379
    read_timeout: 0.2s
    write_timeout: 0.2s
    password: "<your-redis-password>"

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
  access_key: "<your-minio-access-key>"
  secret_key: "<your-minio-secret-key>"
```

2. frontend:
   1. React + Vite + pnpm（`frontend/`，aidesign 风格路由与 UI）
   2. ts
   3. **未服务端持久化**：周菜单与购物清单、采购勾选与历史仅存浏览器（Zustand `persist`）；后端暂无 `meal_plan` / `shopping_list` 等 REST。演示菜谱已并入 `deploy/sql/base.sql`（整库建表脚本，含演示数据）。
