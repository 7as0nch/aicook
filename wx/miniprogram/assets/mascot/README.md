# 包包 Bao - 厨艺吉祥物资源

本目录占位 1x1 透明 PNG。用户从 Figma 导出正式素材后直接替换同名文件即可。

## 文件清单

| 文件名 | 状态 | 用途 |
|---|---|---|
| `bao-default.png` | 占位 | 默认状态，首页问候、AI FAB |
| `bao-smile.png` | 占位 | AI 助理欢迎、推荐卡角标 |
| `bao-wink.png` | 占位 | 烹饪完成、点赞反馈 |
| `bao-thinking.png` | 占位 | AI 流式输出过程 |

建议尺寸：240×240 (@3x)，PNG-24 透明背景。

## 兜底机制

所有引用包包的组件都使用 `iconSrc ? <image> : emoji-fallback` 模式，即使资源不存在 build 也不挂。
