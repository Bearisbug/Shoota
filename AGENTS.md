# 长局

文字游戏平台，纯静态站：`public/index.html` 是平台，`public/games/*.html` 是各款游戏。目录说明、本地预览、加游戏的方法见 `README.md`。

## 部署
<!-- deploy-pipeline:部署 rev 2026-10 -->
本项目已接 push 即部署：push main 自动发布，手册（发布、日志、回滚、密钥键名）见 `docs/DEPLOY.md`。适用范围看改到的文件与动作：改 `.github/workflows/`、`Dockerfile`、compose 文件、Caddy / nginx 站点、systemd 单元、`*.tf`、`deploy.yaml`、`docs/DEPLOY.md`，或重新部署、回滚、排查发布失败、发布含数据库迁移的改动，即适用；拿不准时按适用处理。适用时动手前加载 `deploy-pipeline` 技能并按它执行。日常功能改动先按测试文档过冒烟集再 push main。新增运行时密钥按序做：先登记进 `.env.example`，再按 `docs/LAUNCH.md` 密钥表配到运行环境，最后 push（缺环境变量的新版本起不来，会被健康门回滚）。派给 subagent 时，在任务里写明要加载 `deploy-pipeline`（subagent 不继承）。技能不可用时停下告知用户，不要徒手改管线或手工上线。

## 前端实现纪律
<!-- ui-constraints:前端实现纪律 rev 2026-10 -->
本项目任何 Web 前端改动——新建页面/组件、调样式、修 UI 缺陷、按截图还原、逐条体验优化——动码前必须加载 `ui-constraints` 技能并按它执行，交付前做它要求的真实浏览器验证。适用范围看**改到哪个文件**、不看措辞：碰 `.tsx/.jsx/.vue/.svelte/.css/.scss/.html` 或任何组件、样式文件即适用，「就改一行」「随手调一下」同样适用，拿不准时按适用处理；React Native / Expo 等原生 App 的界面文件不在本段范围，归 `mobile-ui-constraints`。长会话中每进入一次新的前端改动，都要重新按该技能查一遍规则，不要凭上一轮的记忆推进。把前端工作派给 subagent 时，任务里必须写明要加载 `ui-constraints`（subagent 不继承）。技能不可用时停下告知用户，不要凭记忆拼一套前端约束。
