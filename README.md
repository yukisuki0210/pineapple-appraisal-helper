# 菠萝岛鉴定助手

独立于「菠萝岛传说天气计算器」的手机优先静态 PWA。

公开站点：https://velvety-cannoli-b8514a.netlify.app/  
源码仓库：https://github.com/yukisuki0210/pineapple-appraisal-helper

V1 提供当前鉴定倍率记录、下一行牌色比例与风险提示、玩家经验策略、收益试算。收益按基础价值 × 已翻出倍率的乘积计算。仅显示已知的奖励牌和惩罚牌比例，不推算盈利概率。

Netlify 从 `main` 分支构建：`node build.mjs`，发布目录 `dist`。构建会按网站文件内容生成新的离线缓存版本，无需第三方依赖。

本地预览：先运行 `node build.mjs`，再用静态文件服务器从 `dist` 目录预览。PWA 安装与离线功能需要 HTTPS 或 localhost。
