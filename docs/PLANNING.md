# lzhdev.com/utils — 项目规划文档

> 版本 v0.12 · 2026-10-07 · 维护者：Zihao Liu ([lzhdev.com](https://lzhdev.com))
> 状态：M1–M4 已交付（M4 于 2026-10-07 线上验证通过），M5 开源打磨待做。本文档是项目的决策记录与规划总纲，随里程碑推进更新；**系统运行现状**见 [ARCHITECTURE.md](ARCHITECTURE.md)，**部署与运维**见 [DEPLOYMENT.md](DEPLOYMENT.md)，**踩坑清单**见 [GOTCHAS.md](GOTCHAS.md)。

---

## 1. 项目定位与目标

一个挂靠在 lzhdev.com 下的 utilities webapp，三重定位：

1. **自用** — 日常顺手的小工具集合
2. **家人使用** — 需要轻量鉴权，但绝不引入重型账号体系
3. **开源产品** — 代码公开、文档完整、任何人可自部署

功能方向（初期，会持续演进）：

| 方向 | 说明 |
|------|------|
| AI tools | 前端工具通过后端代理调用 AI API；API key 只存服务端 |
| Skills 加载 | 动态加载的资源/技能模块（具体形态待定，架构上按"可动态加载内容"预留） |
| 动态 API | AI 之外的服务端接口：数据持久化、文件处理等 |
| 纯前端小工具 | 计算器、格式化、转换器等，无需后端 |

线上地址（规划）：**https://utils.lzhdev.com**

**核心目的（2026-10-04 明确）**：引入 Docker 与自建服务器的根本原因，是要在后台服务器上运行 **Claude Code 这类 AI agent**；utils webapp 本质是套在 agent 外面的 **UI 壳**——用户在浏览器里直接与服务器上的 agent 对话。其余工具（AI 代理、纯前端小工具）围绕这一核心展开。对 M4 架构的含义：① agent 会话管理（Claude Code Agent SDK / 进程级管理，运行在应用容器内或独立 sidecar 容器）；② SSE/流式输出；③ 会话持久化（SQLite on volume）；④ 家人鉴权前置到 agent 会话之上。

---

## 2. 现状盘点（2026-10-04 实地调研）

- **lzhdev.com 主站**：作品集网站，经浏览器实测为 **Vite 构建的 React SPA**（模板 [awesome-portfolio-page-react](https://github.com/sileneer/awesome-portfolio-page-react) + Framer Motion）。*不是* Next.js / NestJS（此前语音输入的 "Nest.js"、"connect 到 JS" 为转写误差，实指 Next.js）。
- **主站部署位置**：GitHub Pages + Cloudflare Pages（纯静态托管）。
- **lzhdev.com/utils 当前状态**：被主站 SPA 路由重定向回首页——路径被占用但无内容冲突。
- **本地开发环境**（Windows）：Node v24.19.0 ✓、Git（Git Bash）✓。
- **仓库**：本地 `D:\coding\projects\utils` 即仓库根；GitHub 上创建为 public 仓库 `utils`。

---

## 3. 域名与路由方案

### 决策：`utils.lzhdev.com` 子域名 ✅

**否决 lzhdev.com/utils path 方案的原因**：主站在 Cloudflare Pages 上，Pages 无法直接把任意 path 反向代理到外部源站；path 方案必须额外加一个 Cloudflare Worker 做代理，引入新故障点和维护成本。子域名方案完全绕开这一层。

**架构**：

```
用户 → Cloudflare（proxied DNS，TLS 终结/CDN/WAF）
     → 源站服务器 Caddy/nginx 反代（80/443）
     → utils 容器（内网端口，如 127.0.0.1:3100）
```

**配置要点**：

- Cloudflare DNS 添加 A 记录 `utils` → 服务器 IP，开启 proxied（橙色云）
- Cloudflare SSL/TLS 模式设为 **Full (strict)**；源站证书用 Cloudflare Origin CA（15 年免续期）或 Caddy DNS-01 challenge（需 CF API token）
- 附带收益：Next.js **不需要 basePath**，避开子路径部署的整类坑（资源 404、stale chunk、cookie path 等，调研见 §9）
- 可选加固：**Cloudflare Tunnel**（cloudflared）——服务器不开任何入站端口，SSH 部署亦可走隧道；适合家庭/小 VPS 场景
- 可在 Cloudflare Pages 项目加 `_redirects`：`/utils https://utils.lzhdev.com 301`，保留原 URL 记忆点（GH Pages 源同步加）

### 3.1 M2 实施拓扑（2026-10-04 定稿，三项决策已确认）

**服务器**：GCP `instance-20260904-233454`（e2-micro · 1GB RAM · Debian 13.7 · us-east1-c · 外网 IP 35.229.94.124 · GCP 永久免费层）。当前无 Docker，需安装 + 加 swap 兜底。

**入站流量（决策 1）：Cloudflare Tunnel + IAP SSH —— 服务器不开任何入站端口**

```
浏览器 → utils.lzhdev.com（CF 边缘 TLS）
       → Cloudflare Tunnel（cloudflared 出站连接 CF 边缘）
       → VM localhost:3100（utils 容器）
SSH 管理/部署：gcloud compute ssh --tunnel-through-iap（IAP 网段 35.235.240.0/20）
```

配套变更：防火墙 22 端口从 0.0.0.0/0 收紧到 35.235.240.0/20（IAP 专用网段）；443 规则不用（无入站 TLS 需求）。

**CI/CD 认证（决策 2）：Workload Identity Federation 无密钥**

- WIF pool/provider 绑定 `sileneer/utils` 仓库 + main 分支条件；专用 Service Account（如 `utils-deploy@…`）
- 最小角色：`roles/iap.tunnelResourceAccessor` + `roles/compute.osAdminLogin`（ExternalAccount 变体，部署脚本需要 sudo 跑 docker）+ `roles/iam.serviceAccountUser`
- Actions 侧：`google-github-actions/auth@v2`（OIDC，零长期密钥）+ `google-github-actions/ssh-compute` 或 `gcloud compute ssh --tunnel-through-iap`
- 显式否决：SA JSON 密钥 / SSH 私钥存 GitHub Secrets（长期泄露面）

**引导顺序（M2/M3 交织）**：服务器要拉镜像 → 镜像必须先存在于 GHCR → 所以先落地 CI 的 build+push 阶段（M3 前半），再装 Docker + compose pull 起服务，最后接 Cloudflare Tunnel 与 DNS。

**用户侧待提供**：~~Cloudflare API Token~~ ✅ 已完成（2026-10-04，agent 经浏览器在 dashboard 创建 `utils-deploy` token：Account→Cloudflare Tunnel:Edit + Zone lzhdev.com→DNS:Edit，验证 active）。Token 与 account/zone ID 存于项目根 `.env.cloudflare`（被 `.gitignore` 的 `.env.*` 规则覆盖，绝不入库）。其余（WIF、VM 系统级操作）由 agent 通过本机 gcloud/SSH 完成。

---

## 4. 部署架构：原方案评审与最终设计

### 4.1 原方案评审

原流程：`push main → GitHub Actions → HTTP 请求通知服务器 → 服务器同步 repo → 服务器自制 Docker 重建部署`。方向正确（事件驱动替代定时同步 ✅），但有以下问题：

| # | 问题 | 修正 |
|---|------|------|
| 1 | **在服务器上构建镜像**：Next.js 构建内存峰值可达 1–2GB，小 VPS 有 OOM 风险；部署慢、构建期间与线上服务抢资源 | 构建放在 GitHub Actions，镜像推到 GHCR；服务器只做 `docker compose pull && up -d` |
| 2 | **服务器同步 repo 需要 Git 凭证**（deploy key / PAT），扩大泄露面 | 镜像方案下服务器**不需要任何 GitHub 凭证**（GHCR 公共镜像匿名拉取）；compose 文件由部署步骤从 Actions 直接 scp 上传 |
| 3 | **公开的部署触发端点**若不验证身份，任何人都能触发重建（DoS 向量） | 部署通道二选一（见 4.2）：A) Actions SSH 直连；B) 服务器上 webhook receiver（Bearer token + flock） |
| 4 | **部署失败不可见**："发个请求就完事"，Actions 无感知成败 | SSH 方案的 exit code 直接传播回 Actions 日志；另加 `/api/health` 健康检查 + healthchecks.io 死信开关 |
| 5 | **并发竞争**：连续 push 触发并行重建，互相踩踏 | Actions `concurrency: deploy-prod` 串行化 + 服务器端 `flock` 双保险 |
| 6 | **无回滚设计**：重建部署下回滚 = revert + 重新全量部署 | 镜像按 git SHA 打 tag 并保留最近若干个；回滚 = compose 指回旧 tag 一条命令 |

### 4.2 最终设计

```
push main
  └─ GitHub Actions
       ├─ job: test      → lint + test
       ├─ job: build     → 多阶段构建 → ghcr.io/<owner>/utils:<git-sha> + :latest
       └─ job: deploy    → concurrency 串行
            ├─ 方案 A（默认）：SSH 执行服务器 /opt/utils/deploy.sh <sha>
            │     flock 串行 → docker compose pull → up -d → healthcheck 通过才算成功
            │     → 失败自动回指旧镜像 tag
            └─ 方案 B（可选，贴合"服务器收到请求自行部署"形态）：
                  HTTPS 调用服务器上 ~50 行 Node webhook receiver
                  （Bearer secret 常数时间比较 + 仅 POST /deploy + flock + 同步返回结果）
```

**镜像与构建**

- 多阶段 Dockerfile：`deps → builder（next build，standalone 输出）→ runner（alpine，仅含 .next/standalone + .next/static + public）`，镜像预期 ~150–200MB
- tag 规范：`<git-sha>` + `latest`；服务器保留最近 N 个 tag 供回滚
- GHCR 公共镜像：服务器匿名拉取，零 registry 凭证

**部署通道方案 A（推荐）**

- `appleboy/ssh-action`（或原生 ssh）→ 执行 `/opt/utils/deploy.sh <sha>`
- `deploy.sh` 要点：`flock /run/utils-deploy.lock` 串行 → 记录当前 tag → `docker compose pull && up -d --remove-orphans` → curl `/api/health` 通过 → `docker image prune -f`
- compose 文件由 Actions 每次部署时 scp 上传；服务器只需 Docker + 手工维护的 `.env`（chmod 600）
- SSH key 用 GitHub Secrets（`DEPLOY_SSH_KEY` / `DEPLOY_HOST` / `DEPLOY_USER`）

**方案 B（可选）**：webhook receiver 进仓库（`deploy/receiver.mjs`），挂反代内网路径或 localhost 端口 + Cloudflare WAF 限速规则。

**观测性**

- 应用暴露 `/api/health`（容器 healthcheck 也走它；支持 `DRILL_FAIL_HEALTH=1` 演练开关，运行时返回 503）
- **healthchecks.io 死信开关已上线（2026-10-04）**：检查项 `utils-deploy`（周期 7 天 + 宽限 1 天）——deploy.sh 成功后 ping 重置计时器，健康检查门禁失败时 ping `/fail` 立即告警（邮件 → 15061477522@163.com）。即：部署静默停摆超过 7 天、或任何一次部署失败，都会收到邮件。API key 与 ping URL 存 `.env.monitoring`（本地，gitignored）与服务器 `.env`
- 回滚演练已完成（2026-10-04）：`DRILL_FAIL_HEALTH=1` 触发健康检查 503 → deploy.sh 60 秒门禁失败 → 回滚分支执行 → exit 1 → `/fail` 告警 → 移除开关后恢复 healthy。CI 中部署失败红叉已在同日实际故障中验证（.env 权限事件）
- 可选：Uptime Kuma 监控 uptime

**数据持久化**

- 需要 state 的功能数据放 Docker volume（`./data`），容器重建不丢
- 数据库初版用 SQLite（单机、低并发、零运维），挂在 volume 上

**安全设计**

- AI API key、部署 secret 只存在于：服务器 `.env`（chmod 600）与 GitHub Secrets；仓库只带 `.env.example`
- `.env` 永不 commit（.gitignore + 评审把关）
- 家人鉴权（M4）：单实例共享口令/邀请码 + HttpOnly 签名 cookie（简单 session），middleware 保护私有路由；公开工具不设墙；不引入重型 IdP
- 反代只暴露 80/443；SSH 密钥登录；可选 fail2ban / CF Tunnel
- GHCR 镜像公开 = 镜像与代码同源公开（开源本意）；**任何私有配置只在运行时通过 env 注入，绝不烘进镜像**

### 4.3 补充：为什么不用轮询式自动更新

containrrr/watchtower 原版已停止维护且存在 Docker 29+ 兼容问题；社区维护 fork 为 [nicholas-fedor/watchtower](https://github.com/nicholas-fedor/watchtower)，另有 What's Up Docker (WUD)、Diun 等替代。轮询方案延迟不可控且不利于生产，本项目不采用，仅作备选记录。

---

## 5. 技术选型

### 决策：Next.js（App Router + TypeScript，standalone 输出）✅

**依据**：

- **需求匹配**：Route Handlers 做 AI 代理与动态 API；middleware 做家人鉴权；Server Components 减少前端样板
- **自托管一等公民**：`output: 'standalone'` 官方支持，镜像可控；basePath/rewrites 原生（子域名方案下暂用不上，保留灵活性）
- **开源协作友好**：生态最大、贡献者上手成本最低、AI 编码工具对 Next.js 先验最强
- **备选对比**：
  - *Hono + Vite + React*：更轻（镜像 ~60MB、内存更小）、2025 增速最快，但项目结构/鉴权等规范需自搭，开源模板性弱
  - *SvelteKit*：DX 口碑好、产物小，但生态较小、子路径支持有边缘问题、贡献者池小

版本基线：Node 22+（本地 24）；Next.js 以 M1 时 `create-next-app@latest` 的稳定版为准。

**UI 技术栈（2026-10-04 敲定）**：Tailwind CSS v4 + shadcn/ui + lucide-react + next-themes + sonner + react-hook-form/zod。完整设计规范（设计 token、组件规则、布局模式、无障碍、防反复调整条款）见 [DESIGN.md](DESIGN.md)，状态为 **BINDING**，所有 UI 开发必须遵循。

**i18n（2026-10-05 落地）**：utils 站点双语——英文（默认回退）+ 简体中文，next-intl cookie 模式（无 URL 前缀）；默认跟随访客系统语言（Accept-Language），页头语言切换器写 `NEXT_LOCALE` cookie 覆盖。所有可见文案集中在 `messages/{en,zh}.json`。仅 utils 站点配置，不涉及主站。页脚版权行按所有者要求移除。

### 目录结构（2026-10-07 更新）

```
AGENTS.md                  # 只做「规则 + 文档索引」，不放事实副本
CLAUDE.md                  # 指向 AGENTS.md
Dockerfile                 # 仓库根（构建上下文=仓库根）：多阶段 standalone
deploy/                    # docker-compose.yml（本地，含 build）、docker-compose.prod.yml、deploy.sh
src/app/                   # 页面与 Route Handlers（/api/agent/{auth,session,chat}、/htlb/book、/api/health）
src/lib/ · src/lib/agent/  # 共享逻辑 · agent 运行时（auth/models/sessions/workspace）
src/components/            # ui/（shadcn 注册表）、chat/、htlb/、layout/、icons/
messages/                  # en.json / zh.json：全部可见文案（含 tools.<slug> 名称与描述）
data/                      # volume：agent 会话、读者工作区、书籍缓存（gitignored）
docs/
  PLANNING.md              # 本文档：决策记录 + 规划 + 里程碑（中文）
  DESIGN.md                # UI 设计系统（BINDING，英文）
  ARCHITECTURE.md          # 运行态结构：路由、agent/SSE 契约、数据布局、env 契约（英文）
  DEPLOYMENT.md            # 部署与运维手册（英文）
  GOTCHAS.md               # 踩坑清单：症状 → 原因 → 修复（英文）
  HANDOVER.md              # 交接：现在到哪了 / 下一步 / 等 owner 决策（英文，每次交接重写）
.github/workflows/         # CI/CD
```

**2026-10-07 文档重构（决策）**：AGENTS.md 原先混入了运维细节与过期副本（仍写
M3、仍称部署管线使用 GitHub Secrets、仍写"仅 lucide-react 图标"，且目录清单缺
`src/lib/agent/`、`messages/` 等），已瘦身为「规则 + 文档索引」。事实按上表拆分
归属：**一个事实只有一个归属地，其他文档只做链接**——过期副本比缺失更危险，它会
误导下一个 agent。路由规则见 AGENTS.md「Where things get written」一节。

同批新增 **docs/HANDOVER.md**：「当下状态」的唯一归属地（进行到哪、什么是未提交的、
下一步做什么、哪些在等 owner 拍板）。它与其余文档的区别是**允许快速过期**——每次交接
整体重写，不做追加；事实仍归各自文档，交接文件只做链接与排序。

**注意**：CI 只执行服务器上的 `/opt/utils/deploy.sh`，**不会**把 `deploy/` 下的
脚本与 compose 同步上去；改了这两个文件必须手工投递（见 DEPLOYMENT.md §7）。

---

## 6. CI/CD 流水线设计（M3 落地）

```yaml
# .github/workflows/deploy.yml 草图
on:
  push: { branches: [main] }
concurrency:
  group: deploy-prod
  cancel-in-progress: false
jobs:
  test:        # npm ci → lint → test
  build-push:  # needs: test → docker/build-push-action → ghcr.io/<owner>/utils:${{ github.sha }}
  deploy:      # needs: build-push → SSH → bash /opt/utils/deploy.sh <sha>
```

GitHub Secrets 清单：`DEPLOY_SSH_KEY`、`DEPLOY_HOST`、`DEPLOY_USER`、`HEALTHCHECK_URL`（可选）。

---

## 7. 里程碑

| 里程碑 | 内容 | 验收标准 |
|--------|------|----------|
| **M0** ✅ | 规划文档、仓库初始化 | 本文档存在；GitHub public 仓库建立 |
| **M1** ✅ 2026-10-04 | Next.js 16 脚手架 + shadcn + 设计 token + 应用外壳 + Dockerfile（standalone）+ compose | 本地 build/lint 通过；生产服务器 + `/api/health` 冒烟测试通过（本地无 Docker，镜像构建在 M3 CI 首跑验证） |
| **M2** ✅ 2026-10-04 | 服务器上线 + Cloudflare Tunnel + DNS + 防火墙收紧 | **https://utils.lzhdev.com 端到端可访问**（/api/health ok、页面 200、~360ms）；CI test→build→GHCR 同日上线（首个镜像已可匿名拉取） |
| **M3** ✅ 2026-10-04 | CI/CD 全自动部署 | push main → test → build(GHCR) → **WIF 无密钥 deploy**（临时 SSH key + IAP 隧道 → deploy.sh：flock/pull/up/健康检查门禁+自动回滚/保留 3 个镜像）；healthchecks.io 死信开关上线；**回滚演练通过**（drill 开关触发失败→回滚→恢复全程验证） |
| **M4** ✅ 2026-10-07 | 产品功能：① /htlb 阅读页（HowToLiveBetter 单文件书 release 代理+按天缓存+首页工具卡）；② AI 侧边栏（口令门禁 → SSE 流式 → 会话持久化 data/agent/sessions + SDK session resume）；③ 服务器端 Claude Code（claude-agent-sdk，读者工作区=书正文+正本技能，上游维护者 CLAUDE.md 刻意排除）；④ SenseNova Anthropic 兼容端点 | **线上端到端验证通过**：问"替朋友担保签不签"→ 照书回答引用第 8 节第 18/45 条+证据等级；门禁 401/200 正确；书代理 1.3s 缓存命中。实施坑（已修）：SDK 原生 CLI 是按 libc 门的 optional 依赖（alpine 会静默跳过→全链路 slim）；Next standalone 不搬运动态解析的兄弟包（显式 COPY）；多层 shell 变量展开静默失败（.env 用定值） |
| **M5** | 开源打磨 | CONTRIBUTING、issue/PR 模板、截图、README 完善 |

---

## 8. 风险与未决问题

- **服务器规格未知**：构建已移出服务器，OOM 风险大幅降低；剩余为内存余量与磁盘镜像积累（deploy.sh 已含 prune）
- **"skills 加载"具体形态未定**：agent skills 文件托管？插件式前端模块？M4 前细化
- **AI API 成本控制**：代理端按用户/工具做限额与用量记录（M4 设计）
- **双托管一致性**：lzhdev.com 同时在 GH Pages 与 CF Pages，`_redirects` 需两处同步（以 CF Pages 为准）
- **公开仓库纪律**：从第一天起仓库历史公开，任何秘密入库都将成为永久历史——以 `.env.example` + 评审红线约束

---

## 9. 参考资料（调研来源）

**部署模式**
- ServiceStack：GitHub Actions + Docker Compose SSH 部署模式 — https://docs.servicestack.net
- appleboy/ssh-action — https://github.com/appleboy/ssh-action
- watchtower 现状与社区 fork — https://github.com/nicholas-fedor/watchtower
- What's Up Docker (WUD) — https://github.com/getwud/wud

**Next.js 子路径部署（否决 path 方案的依据）**
- Next.js 官方 rewrites 文档 — https://nextjs.org
- Next.js basePath 子路径部署指南 — https://dev.to
- GitHub Issue #11912（Next.js 子路径 + nginx 资源 404）— https://github.com

**框架选型**
- The State of Full-Stack JS Frameworks 2025 — https://flaming.codes/posts/beyond-nextjs-state-fullstack-javascript-frameworks-2025
- Next.js vs Astro vs SvelteKit 2026 — https://www.pkgpulse.com/guides/nextjs-vs-astro-vs-sveltekit-2026
- 框架决策指南 2026 — https://dev.to/pockit_tools/nextjs-vs-remix-vs-astro-vs-sveltekit-in-2026-the-definitive-framework-decision-guide-lp5
- 2025 JavaScript Rising Stars（Hono 增速）— https://risingstars.js.org

**主站**
- 个人网站模板来源 — https://github.com/sileneer/awesome-portfolio-page-react

---

## 10. AI Chat 优化实施计划（2026-10-07）

**状态：owner 已于 2026-10-07 批准完整三批计划；本地实现已落地，验收状态见 HANDOVER §7。** 问题证据统一见
[GOTCHAS §I](GOTCHAS.md#i-chat-ui-investigation-2026-10-07)，这里仅记录
拟实施范围、顺序与验收。历史 M4 的后端验证不替代这次界面验收。

### 10.1 审批范围与交付目标

推荐批准下述三批实现及共同验收，交付一个可本地预览、测试通过的完整版本：
读者能顺畅发问、停止/重试、继续旧对话，并能从回答回到对应原文。
本次审批包括任务所需代码、文案、文档、测试和下述两项渲染依赖；**不包含
Git 提交、推送或生产部署**。发布沿用项目流程，完成本地验收后再申请发布。

沿用 Next.js、现有 Agent SDK、Tailwind/shadcn、文件存储、口令门禁和视觉 token。
此次不做账号/SQLite 迁移、并发扩容、独立通用聊天页、模型基准测试或默认模型变更。
不会把既有未提交文档重构自动纳入上线授权。

批准后先更新 DESIGN §5.6 的聊天交互约定，登记新增渲染依赖/模式，再使用它们。
设计规范中的规则只写在 DESIGN，运行契约只写在 ARCHITECTURE，踩坑状态只写在
GOTCHAS，当下进度只写在 HANDOVER；本节保留实施阶段与决策。

### 10.2 第一批：会话可靠性与恢复

**实现**

- 将会话状态集中到 ReadingShell 上层的共享控制器/hook，桌面面板与移动 Sheet
  使用同一消息、草稿、模型、请求和会话状态。开关面板、切换宽度不重复发请求。
- 为消息/回合/请求建立稳定 ID；明确提交中、生成中、完成、失败和已停止状态。
  正常结束只结算一次；服务端失败不再随后发送成功结束。解析器处理分块 UTF-8、
  keepalive 和没有终止事件的 EOF，保留未完成内容并明确标记。
- “停止”取消客户端请求并传递到 Agent；“新对话”先取消/失效旧请求，再切换
  会话。即使旧请求的最后数据稍后到达，也不能写入新对话。
- 失败消息提供手动重试，保留问题并复用失败回合的位置；忙碌/限流不自动重试。
  生成中可编辑下一条草稿，发送仍按现有单请求限制执行。
- 增加受现有鉴权保护的历史读取能力，仅读取当前 UUID 对应的会话，不增加全量
  会话枚举。兼容旧 JSON；旧消息补稳定 ID/默认状态，写入采用临时文件原子替换。
- 已完成与失败/停止的回合分别保存；失败回合不能作为正常答案恢复。恢复历史时
  校准 SDK 上下文：对失败/中断后上下文不确定的 SDK 会话，使用已完成对话重建
  上下文，再重试当前问题，避免隐藏的失败回合重复进入模型。
- 保留刷新前的输入草稿；普通刷新恢复已保存消息。生成中整页刷新按中断处理，
  不承诺断线续流。处理存储不可用、401/口令过期及历史加载失败。

**验收**

1. 正常流、完整消息回退和多段数据均只显示一份答案。
2. 在等待首字、生成中和终止边界停止/新建对话，均不串话；后端释放占用。
3. 空 EOF、部分 EOF、超时、429、401、Agent 错误均有明确状态和可行恢复操作。
4. 手机关闭重开、桌面/手机切换、普通刷新后，历史和草稿按约定恢复。
5. 重试不重复添加问题；后续追问使用的上下文与用户可见的完成历史一致。
6. 旧会话文件可读；无鉴权请求被拒绝；非法 UUID 无法读取文件。

### 10.3 第二批：聊天界面与答案阅读

**布局与交互**

- 顶栏保留返回/书名/聊天入口，加入现有主题与语言控件；手机收进紧凑设置菜单。
  聊天标题行放“照书问答”与新对话/关闭，模型选择放独立次级行，减少标题截断。
- 桌面沿用侧栏，平板宽度优先保障原文阅读；手机复用现有 Radix Sheet。
  桌面与手机开关状态分开管理；支持 Escape、焦点约束与关闭后焦点返回。
- 口令页先简短说明能力；解锁空状态提供三个示例问题：“解释当前条目”、
  “找几条不花钱、容易开始的改善”、“比较两个选择”。无选中条目时第一个
  引导读者选择原文，避免发送含糊的“当前条目”。解锁前不触发付费调用。
- 使用现有 Textarea，自动增高且有上限；桌面 Enter 发送、Shift+Enter 换行，
  中文输入法组合期间不发送；手机回车换行，用发送按钮提交。
- 支持标题、列表、引用、代码和表格的 Markdown 答案及复制操作；长链接断行，
  宽表格/代码只在自身容器内滚动，页面本身不得横向溢出。
- 只有用户接近底部时才自动跟随新内容；向上阅读时保留位置并提供“回到最新”。
- 等待状态以真实事件为依据：准备、查阅原文、生成回答；只显示简洁阶段及耗时，
  不展示原始工具参数、命令或虚构进度百分比。
- 模型说明与中英文 locale 一致，围绕读书用途表述；未实测的模型不标“最快”或
  “最稳定”。触屏目标 >=40 px、文字 >=12 px、图标操作配 Tooltip 与可访问名称。

**拟新增依赖**：`react-markdown` + `remark-gfm`，用于答案渲染和表格支持。
批准后先登记 DESIGN，再安装并锁定版本；使用语义 token 的组件映射，禁用原始
HTML，不引入新 UI 框架、样式系统或语法高亮库。
官方能力说明：[react-markdown](https://github.com/remarkjs/react-markdown)、
[remark-gfm](https://github.com/remarkjs/remark-gfm)。

**验收**：中文输入法不误发；多行输入与复制正确；流式 Markdown 可读；长答案
不会抢走阅读位置；中英文无串用；浅/深色在 360/768/1280 px 均可用；手机
软件键盘打开后输入和发送按钮仍可见；Sheet 的键盘/焦点行为及点击目标合格。

### 10.4 第三批：原文与聊天联动

**先统一来源版本**

- 识别发布 HTML 声明的正文提交，建立版本清单；查书目录取同一提交的原文。
  HTML 与原文作为一套版本准备完毕后再切换当前版本，刷新失败保留上一套。
- 聊天请求绑定读者当前看到的书籍版本；已有 SDK 会话继续绑定其原版本。
  版本变化时明确提示新开对话使用新版，避免旧上下文静默混入新版来源。
- HTML 缺少可验证修订标识或对应提交拉取失败时，不能宣称已同步；优先保留
  上一套验证版本。首次准备无可用版本则报告具体阻塞，不自行改用未经确认的来源。

**再加入联动**

- 在本项目的书籍代理中注入轻量桥接脚本，不修改上游书籍仓库。
  消息验证同源、具体 iframe 来源与数据格式，并清理监听器。
- 读者选中文字/条目后出现“问 AI”；问题区显示可移除的原文片段和出处。
  只发送读者明确选择的有限片段与来源标识，不把整个页面随每轮问题发送。
- 把可确定的“第 X 节第 Y 条”引用做成来源入口；确认版本和条目存在后，点击
  让阅读区解除必要筛选、加载目标、滚动并高亮。手机先收起 Sheet 再展示目标，
  再打开聊天时仍保留原消息与草稿。
- 分组、范围和模糊引用只有在可无歧义解析时才生成入口；不存在的引用保留原文
  并说明无法定位，不伪造来源。“已验证”仅指定位/版本一致，不表示论述已被事实核查。

**验收**：选文上下文可见且可移除；连续追问不意外重复附加片段；引用能定位
被筛选/尚未加载的条目；手机能完成“回答 → 原文 → 回到聊天”；来源不存在、
版本更新和刷新失败均有明确退路；Agent 与阅读区的修订号一致且可核验。

### 10.5 实施顺序、验证与交付

执行顺序：设计契约登记 → 第一批及回归 → 第二批及浏览器检查 → 第三批及
来源/联动检查 → 整体验收。依赖顺序固定；不为外观先绕过会话或来源问题。

- 为第一批状态机/SSE、旧数据兼容及第三批引用/来源契约增加针对性自动回归。
  优先使用 Node 自带测试运行器与必要的本地浏览器桩，不加大型测试框架。
- 在本地模拟后端验证登录态、流式回答、错误、停止、刷新与联动；桩只用于测试，
  不提供可在生产启用的鉴权绕过。
- `npm run lint` 和 `npm run build` 均须退出 0；浏览器验收覆盖中英文、浅/深色、
  360/768/1280 px、短/长答案、键盘、触屏目标和真实手机软件键盘（若环境无法
  提供真实软件键盘，明确留为待验项，不把桌面视口模拟当作已通过）。
- 最后串行做少量真实 Agent 验证，原则上最多六轮；主要覆盖真实查书、追问、
  SDK 恢复及停止。开发回归使用模拟数据，避免突发请求耗尽上游额度。
  所有真实浏览器测试需要 owner 在页面直接输入口令，无需把秘密发到聊天。
- 每批记录文件变更、测试与截图；兼容原数据，避免不可逆迁移。完成后更新对应
  文档、HANDOVER 和问题修复状态，交付本地预览与逐项验收结果。
- 提交/上线待后续 owner 授权。届时逐项核对既有文档重构，按任务范围组织
  Conventional Commits；推送后等待 Actions 全绿，检查健康接口并在线复验，
  失败按 DEPLOYMENT 的现有回滚流程处理。

**审批方式**：回复“批准完整计划”可授权上述三批本地实现与验收；也可批准
“只做第一、二批”，第三批保留为待审批。批准前只维护规划与交接文档。

---

## 11. 公开邮箱账号：调查与拟实施方案（2026-10-07）

**状态：Owner 于 2026-10-07 批准本地实施；Brevo key 已创建，服务配置与真实验收待完成。** Owner 已明确：任何人可以
注册，注册需要邮箱验证码，日常使用邮箱＋密码登录。本节是方案唯一归档处；
本地已安装账号/数据库依赖并完成框架与模拟服务回归；尚未发布或发送真实测试邮件。
Owner 于 2026-10-08 报告 BREVO_API_KEY 已保存到服务器；域名认证正在配置。
当前实现与未完成验收见 HANDOVER §7，实际协议见 ARCHITECTURE。

### 11.1 现状与选型

现有 `src/lib/agent/auth.ts` 只校验共享口令和签名到期时间，无法返回用户 ID；
`/api/agent/auth` 的 IP 限流存在进程内，重启清零；聊天 JSON 无用户归属。
目前鉴权通过的人可按 UUID 获取同一共享空间的会话。这适合原来的家庭口令，
不能直接沿用为不同公开用户之间的权限模型。

推荐 **Better Auth（自托管）＋ SQLite（现有持久卷）＋ Brevo 事务邮件 API**。

- [Better Auth](https://better-auth.com/docs/integrations/next) 提供 Next.js
  Route Handler 集成；[邮箱密码模块](https://better-auth.com/docs/authentication/email-password)
  管理密码哈希和登录会话；[Email OTP](https://better-auth.com/docs/plugins/email-otp)
  支持邮箱验证和找回密码。其核心库采用
  [MIT](https://github.com/better-auth/better-auth/blob/main/LICENSE.md)，账号数据留在本机。
- [SQLite 适配](https://better-auth.com/docs/adapters/sqlite) 支持 better-sqlite3。
  当前单容器、1 GB VM、单 Agent 请求，适合小规模账号先落地；不额外运行
  PostgreSQL/Redis 或开通托管数据库。未来多实例/高写入需求再评估 PostgreSQL。
- 本轮是调研推荐，不把上述库写成已安装。批准实施后锁定兼容版本并验证
  Windows 开发、Node 22 Debian slim 和 standalone 原生依赖打包。
  Better Auth 的登录模块能满足当前需求，自写整套密码/会话系统的维护成本更高。

### 11.2 发信服务调查

下列是 2026-10-07 查询到的官方公开额度，不代表已通过账号审核或实测送达。
验证码属于事务邮件；不要用营销联系人额度代替事务发信额度。

| 服务 | 免费事务邮件额度 | 主要限制 / 成本取舍 | 本项目判断 |
| --- | --- | --- | --- |
| [Brevo](https://help.brevo.com/hc/en-us/articles/208580669-FAQs-What-are-the-limits-of-the-Free-plan) | 300 封/日，无免费期限；未用额度不结转 | 达上限后事务邮件进入重试队列；免费品牌标记政策需在验证码模板中确认 | 免费额度优先，推荐首选；30 天理论上限 9,000 封是算术换算，不能跨天集中使用 |
| [Mailjet](https://documentation.mailjet.com/hc/en-us/articles/360043048393-What-is-this-200-emails-per-day-limit-on-free-accounts) | 6,000 封/月，200 封/日 | 月限额＋日限额，仍需验证发信身份 | 免费备用候选 |
| [Resend](https://resend.com/pricing) | 3,000 封/月，100 封/日 | [额度规则](https://resend.com/docs/knowledge-base/account-quotas-and-limits) 包含收发；Pro 为 $20/月、50,000 封，无日上限 | Next.js 接入便利；免费突发容量低于前两者，适合作为开发便利优先的替代选择 |
| [Amazon SES](https://aws.amazon.com/ses/pricing/) | 新账号有期限/资格限制的促销额度，不能当长期免费 | 按量基础出站费 $0.10/1,000 封，另计数据/选用功能；[sandbox](https://docs.aws.amazon.com/ses/latest/dg/request-production-access.html) 限制收件人，公开注册须申请生产权限 | 免费额度不足后的低单价增长方案，接入与审核成本更高 |

**推荐理由：** 用户把免费和少限制放在前面；Brevo 在这几个成熟候选中日免费额度
最高。普通密码登录无需邮件，消耗集中在注册、重发、找回密码，当前不需要每次
登录发送 OTP。Brevo 是拟选主服务，Mailjet/Resend 为可替换适配；首版不做多供应商
自动故障切换，避免一个验证码被多个发送流程重复投递。

**选型落地条件：**

1. Owner 创建/登录 Brevo 账号，完成
   [事务平台激活](https://help.brevo.com/hc/en-us/articles/115000188150-Troubleshooting-Issues-with-Brevo-SMTP)
   （官方说明可能需要联系支持）。没有激活不能宣称可用于公开收件人。
2. 使用独立发信子域，例如 `auth.lzhdev.com`，发件人
   `Utils <noreply@auth.lzhdev.com>`；按
   [Brevo 域名认证](https://help.brevo.com/hc/en-us/articles/12163873383186-Authenticate-your-domain-with-Brevo-Brevo-code-DKIM-DMARC)
   提供的记录配置 DNS，保护现有主域邮件记录，不自行重复添加 SPF/DMARC。
   API key 仅服务端 env，HTTPS API 避免新增 SMTP 端口配置。
3. 用 owner 授权的测试邮箱覆盖 Gmail、Outlook、QQ、163，记录延迟、垃圾箱和
   实际模板/品牌标记。任何“稳定送达国内邮箱”的判断须有实测，不能由额度推出。
4. 系统自己做原子发信预算预留、检查服务额度并提前留出找回密码容量；接近
   日限额时拒绝新发送并给出恢复时间，不让 5–10 分钟 OTP 等到第二天。
   API 接受、成功送达和邮箱已验证是三个不同状态；短码过期后必须重新申请。
5. 抽象一个服务端 mail adapter，记录请求/供应商消息 ID 与结果；不存明文 OTP
   或带验证码的邮件正文，不记录密码/密钥。无需为首版再加邮件 SDK/邮件编辑器。

### 11.3 数据库安排

拟使用 `/app/data/utils.sqlite`，宿主机沿用 `/opt/utils/data` 持久挂载；数据库
不进镜像或 Git，书籍 HTML/Markdown 和 SDK 文件仍放文件系统。

| 逻辑表（实施时按锁定框架 schema 生成/映射） | 内容与用途 |
| --- | --- |
| users | 稳定用户 ID、规范化唯一邮箱、昵称、验证状态、server-owned role/status |
| accounts | 用户对应 credential 账号和密码哈希；不另复制密码到 users |
| login_sessions | 数据库登录会话、用户外键、过期时间；支持退出和撤销 |
| verifications | 按邮箱＋用途区分的 OTP 校验记录和过期信息，由认证插件管理 |
| auth_rate_limits | 框架请求计数；补充服务端邮箱/IP/全站限流键，原子检查＋递增 |
| conversations | owner_user_id、原会话 UUID、书籍版本、SDK ID、needsRebuild、时间戳 |
| messages | 对话外键、message/turn ID、角色、正文、context/revision、完成/失败状态 |
| ai_usage | 用户/请求的额度预留、运行结果、可获得的 usage；不把缺失 token 当 0 成本 |
| mail_requests | 脱敏发送元数据、用途、供应商 ID、发送状态与预算预留；无明文短码 |

认证表以 [Better Auth schema](https://better-auth.com/docs/concepts/database) 为准，
不自行设计一套与框架并行的登录 session/验证码存储。server-owned role/status 禁止
客户端注册时赋值；首次公开注册者不能自动成为管理员。Owner 账号验证后通过明确
服务端管理命令提权。邮箱规范化不自行删除 Gmail 的点号或 plus 部分。

拟开启外键、WAL、合理 busy timeout；保持事务短小，不在邮件/API 等待或 SSE
全程中持有数据库事务，消息在阶段/结束时保存，不逐 token 写库。
[WAL](https://www.sqlite.org/wal.html) 适用于本地单机，仍只有一个 writer。
实施时核验驱动实际 SQLite 版本包含
[WAL-reset 修复](https://www.sqlite.org/news.html)，而非只检查 npm 包名。

迁移 SQL 版本化并随代码入库；运行时独立迁移步骤在服务接流量前执行，不在
Next build 或每个请求中自动修改 schema。迁移前和每日使用
[SQLite backup API](https://www.sqlite.org/backup.html) 制作一致性备份，副本按权限
保存并有异机恢复方案；验证恢复与旧镜像兼容性。不能在 WAL 活跃时仅复制主 db，
也不能在应用回滚时自动用旧备份覆盖新注册账号。

**旧聊天处理（Owner 批准时更新）：** 网站尚未公开使用，不迁移旧 JSON。
保留忽略目录中的旧文件，新账号只读取 SQLite 中归属于自己的新会话；旧 UUID
与旧口令 cookie 不提供认领或访问权限。新用户读、写、重试和恢复同时验证 userId。

### 11.4 注册、登录与恢复流程

1. 用户在 `/register` 填邮箱、密码，昵称可选（认证层提供默认显示名）。密码建议 12–128 字符，支持密码管理器
   粘贴，不强制符号拼凑；由框架做慢哈希。注册/重发/找回入口校验
   [Turnstile](https://developers.cloudflare.com/turnstile/plans/)（免费方案可用），
   叠加限流，而非把 CAPTCHA 当唯一额度保护。
2. 创建未验证账号和 credential 记录，发送 6 位随机 OTP，建议有效 10 分钟。
   注册提交不创建可使用 AI 的登录会话；失败/延迟可以在验证页手动重发。
3. 验证页单个验证码输入框支持整段粘贴/自动填充；60 秒重发间隔，建议同邮箱
   5 次/小时，单码最多 5 次校验失败。用途独立，旧码在重发时失效，成功码只用一次。
   限流在服务端持久化，刷新和重启不能重置。以上数值是实施建议，可配置。
4. 成功后设置 emailVerified，再通过邮箱＋密码登录。首版不依赖跨页面保留密码来
   自动登录；验证页提供返回登录入口。日常登录不发 OTP，未验证账号只走验证流程。
5. `/login` 支持登录、忘记密码、注册入口；框架 Route Handler 在
   `/api/auth/[...all]`；服务端每个私有路由取得 user/session，不能只检测 cookie 存在。
   Cookie 为 HttpOnly、生产 Secure、SameSite、host-only；退出撤销 session；
   忘记密码使用独立用途 OTP，重置后撤销其他登录会话。
6. 插件只用于邮箱验证和密码恢复，服务端禁用 OTP-only 登录端点并拒绝发送
   sign-in 用途短码，不留下“界面用密码、API 却能走其他入口”的旁路。
   显式设置 OTP 安全存储（插件默认可能是明文），建议使用服务端密钥化摘要；
   校验记录绑定规范化邮箱与用途，实现单次消费/并发重放回归。库 API 以锁定版本验证。
7. 注册/找回响应避免暴露邮箱是否已注册；登录失败统一提示。固定 baseURL/
   trustedOrigins 和站内 returnTo，验证来自可信 Tunnel 的客户端 IP；不信任任意
   x-forwarded-for。避免在日志/URL/localStorage 放密码、OTP 或会话 token。
8. 登录成功返回原阅读页；localStorage 草稿/会话选择按用户分区，退出与切换账号
   取消活动请求并清空可见私有历史。公开书籍和前端小工具仍可直接使用。

### 11.5 开放注册与付费 Agent 的边界

开放注册是 owner 已确认的产品方向，初始 AI 额度决定见 §11.8。邮箱验证后的
普通用户有可配置日配额，并设置全站调用/预算上限与管理员暂停开关。先原子
预留额度，再启动 SDK；忙碌且未调用上游可释放预留，超时/部分输出不能假定免费。
保留单 Agent 并发限制，不因新增数据库自动扩容。具体免费轮数和全站预算待 owner
决定，不在这次调研替 owner 承诺无限服务。

**现有实际边界必须改进：** chat route 允许 Read/Grep/Glob/Bash，并把完整
process.env 传给 SDK，同一容器运行。cwd 位于书目录只是工作目录，不是权限隔离。
在公开 AI 可用之前，查书工具须限制到受服务端校验的书籍只读内容；禁止通用
shell、任意路径和网络工具访问账号数据库、其他用户会话、认证/邮件密钥。优先
提供窄化查书接口并适配现有读书技能；若保留通用文件/shell 工具，则必须先完成
独立 OS/容器权限隔离。只写系统提示或把数据库移出 cwd 不足以验收。
SDK 进程仅获必需 provider/runtime 配置，不能继承新认证/邮件秘密；仍遵守
GOTCHAS 对 SDK 必需环境的说明并验证运行。Owner 所需的通用 Agent 能力另行设计
权限，不默认授予所有公开注册者。

### 11.6 实施批次与验收

| 批次 | 工作 | 完成条件 |
| --- | --- | --- |
| 0：准备与确认 | Owner 准备 §11.7 的服务资源；确认 AI 额度；旧聊天按已批准决定不迁移；记录待配置状态 | 不依赖生产密钥完成规划；列清开户/激活/DNS/实际送达各自状态 |
| A：基础与迁移 | DESIGN 登记账号 UI/表单新增依赖；锁定认证/SQLite；生成迁移、备份恢复、owner bootstrap；忽略旧 JSON | 本地和 Node 22 Linux 可读写；重启不丢数据；旧记录不导入；迁移/恢复通过 |
| B：邮箱与账号闭环 | mail adapter、额度守门、验证/登录/重发/找回/退出；可信来源、持久化限流和 Turnstile | 错误/过期/旧码/重复消费/并发验证码均拒绝；未验证不可登录；发送失败可恢复；重置撤销会话 |
| C：聊天权限与公开边界 | user-owned conversation/message、SDK 恢复、配额、工具权限/环境隔离、旧 cookie 退役 | 用户 A 不能读取/修改/重试 B 的会话；旧 passcode cookie 不再授权；越界查文件/取密钥工具请求拒绝；完成真实查书与配额回归 |
| D：体验与发布准备 | 中英/浅深/360 px/软件键盘/验证码粘贴；少量真实邮件与真实 Agent；同步文档 | lint/test/build、Linux 容器原生库、邮件送达、重启、备份恢复、账号切换均过；列出仍未通过的门槛 |

B 可在本地桩中先验收，但公开注册和 AI 权限切换必须一起满足 C 的隔离门槛。
登录 UI 沿用现有 shadcn；表单依赖按 DESIGN §4.1 先登记，不在调查阶段安装。
ARCHITECTURE/DEPLOYMENT 仍描述实际运行；实施后在同一提交更新，而非提前宣称
SQLite/login 已上线。旧口令鉴权的删除和安全规则更新随经过验收的切换一起做。

**依赖与交付顺序：** 获得实施授权后，A 和使用本地 mail/Turnstile 桩的 B 可以
在 owner 准备服务账号期间完成，不因没有密钥而停下代码工作。C 随后验证私有数据
和工具隔离；D 的真实测试才依赖账号激活、域名认证和 server env。每批提供本地
预览、回归结果和实际剩余项；最后交付数据库迁移/恢复步骤、完整账号闭环及已
登记的配置契约。公开注册与 AI 切换只在 A–D 验收通过后进入发布审批。

### 11.7 Owner 需要准备的账号、资源与要求

**新增第三方账号只有 Brevo。** 既有 Cloudflare/GCP/GitHub/AI provider 继续使用；
SQLite 和 Better Auth 都在自己的应用内运行，不需要云数据库或认证 SaaS 账号。
下面是准备清单，不是由 agent 代为开户、生成密钥或改变 DNS 的授权。

| 资源 | Owner 准备 | 完成标志 |
| --- | --- | --- |
| [Brevo 免费账号](https://onboarding.brevo.com/account/register)（新注册，已有可复用） | 用自己能长期收信的邮箱注册，验证邮箱，按页面填写真实个人/项目资料；选择 Free，具备本人完成账号身份验证的条件 | 能进入控制台且账号没有阻止事务邮件的限制；Free 无需信用卡，额度见 §11.2 |
| Brevo 事务邮件平台 | 说明是 utils 网站的注册验证和密码找回邮件；如未启用，向支持申请激活，不上传营销名单 | Transactional/SMTP & API 已可用；后续一封授权真实测试被接受并送达 |
| `auth.lzhdev.com` 发信域名 | 用既有 Cloudflare 账号管理 lzhdev.com 的 DNS，按 Brevo 展示值添加认证记录；不新增购买域名 | Brevo 显示域名认证通过；实际邮件头检查也通过 |
| Brevo sender 与普通 API key | 域名认证后添加 `Utils <noreply@auth.lzhdev.com>`；在 Settings → SMTP & API → API Keys & MCP 创建普通 API key，命名例如 utils-auth-production | sender 已验证；key 活跃且安全保存；使用 HTTP API 的 key，不是 SMTP key 或 MCP key |
| [Cloudflare Turnstile](https://developers.cloudflare.com/turnstile/get-started/widget-management/dashboard/)（复用现有账号） | 能管理 Turnstile，创建 utils-auth widget，模式 Managed，生产 hostname 为 `utils.lzhdev.com`；不把发信子域当网页 hostname | 获得 Site key 和 Secret key，生产 hostname 正确；本地使用官方测试 key |
| 本应用的 owner 用户 | 选一个常用邮箱，账号功能完成后在我们的网站注册并验证，再通过明确的管理步骤提权 | 可登录应用、管理允许的设置；不会因“第一个注册”获得权限 |

开户的补充资料/电话要求随账号和风控不同。公开注册页由 JS 渲染，本轮未完成
个人开户流程，因此不能声称一定免手机号、免主体审核或保证立即激活；如页面
要求补充联系方式/项目用途，按实际情况填写。公司字段不等于已核实必须注册公司。

Brevo [Free 官方说明](https://help.brevo.com/hc/en-us/articles/208589409-About-Brevo-s-pricing-plans)
确认无需信用卡。创建 key 等敏感操作需要
[邮箱或已配置的二次验证](https://help.brevo.com/hc/en-us/articles/39362080737554-Verify-your-identity-for-sensitive-actions-in-Brevo)，
由 owner 完成，不把验证码/账户密码交给 agent。

**发信域名不是邮箱托管账号。** Brevo 官方说明，认证域名下的 sender 会
[自动验证](https://help.brevo.com/hc/en-us/articles/208836149-Create-a-new-sender-From-name-and-From-email)，
因此仅为发验证码无需再购买 noreply 邮箱的收件服务。Reply-To 使用现有能收信的
支持邮箱。若没有先认证域名，Brevo 会向 sender 地址发送校验码，不能假定一个
没有收信配置的 noreply 地址能收到这封邮件。

**API key 的额外要求：** [官方文档](https://help.brevo.com/hc/en-us/articles/209467485-Create-and-manage-your-API-keys)
说明 key 创建时仅显示一次，即使选择无到期日期，连续 90 天没有成功 API 调用
仍可能停用。建议创建时保存到密码管理器、记录轮换/停用规则；运维验收包含 key
状态与发信异常检查，不靠邮件失败后才发现。若启用了陌生 IP 拦截，后续真实测试
需要 owner 确认来自实际服务器的调用；不得为省事关闭账号安全保护。
不要勾选创建 MCP key：官方说明这会替换并停用刚生成的普通 API key。

Turnstile 的 [免费方案](https://developers.cloudflare.com/turnstile/plans/) 可用于生产，
无需购买 Cloudflare 付费套餐。创建 widget 不是新建 Cloudflare 账号；无需为
Turnstile 再创建可管理整个 DNS zone 的 API token。

### 11.8 配置交接和仍需 owner 决定的事项

Owner 可以在聊天里报告“账号注册/事务平台激活/域名验证/widget 创建已完成”，
以及网站管理员/测试用的邮箱、发件人和 Reply-To 等非秘密配置。不得把 API key、
Secret key、密码、恢复码、OTP 粘贴到聊天、文档、截图或提交中。

真实 secret 由 owner 保存到密码管理器，并在后续配置阶段进入服务器
`/opt/utils/.env`（600 权限）：拟定 `BREVO_API_KEY`、`TURNSTILE_SECRET_KEY`、
`BETTER_AUTH_SECRET`。认证 secret 由安全随机生成器创建，不来自任何开户服务。
公开 Site key、MAIL_FROM、Reply-To、认证 URL 与 DB 路径由实施统一配置。
实际配置契约已进入 ARCHITECTURE §8；操作步骤见 DEPLOYMENT §11。
开发先用桩，真实配置值不放镜像或浏览器（Site key 除外）。

2026-10-08，owner 表示上游额度充足，要求比每人 3 次/全站 50 次更宽裕。
据此先准备 **每人每日 100 次、全站每日 2,000 次** 的初始值；这是实施方选择的
可调整初值，并非 owner 逐项指定的数值。服务器已保存对应非秘密配置，仍保持
`AI_ENABLED=0`，没有重启生产服务。启用须等待真实 Agent 验收与发布授权。
额度通过 server env 可调，owner 管理权限同样受全站硬上限约束；旧聊天明确不迁移。
较大的日配额不改变单次并发限制，也不等于已核实上游费用或服务器吞吐能力。

Owner 无需同时注册 Mailjet、Resend、AWS、Supabase、Clerk、Auth0 或数据库服务。
Brevo 只有在事务激活/域名/实际送达验收失败或额度不合适时，才重新比较替代服务。
本地实施已获批准。2026-10-08，owner 进一步批准提交到检查分支、推送并创建草稿
PR 运行只读 CI，及在 Tunnel/loopback 入口前提下保存 Cloudflare IP 信任配置。
合并 main 与生产部署仍单独审批；检查分支授权不等于上线授权。

### 11.9 本地实施落点（2026-10-08）

A–C 的本地账号/数据库/会话归属/配额守门与窄化书籍 MCP 工具已实现。
27 项回归、lint/type-check 与生产构建通过；真实邮件/SDK、完整 Linux 应用镜像、
实体手机键盘尚未验收，不视为已上线。数据库实际 SQLite 为 3.53.4。
默认关闭 AI（额度准备见 §11.8）；第一位注册者不自动提权。
没有为了缺少真实 key 而在产品添加开发邮件或认证绕过入口：测试在独立
loopback 进程/数据库拦截邮件与 CAPTCHA，应用仍走真实 Better Auth 路径。
具体文件、预览、证据和发布门槛统一记录到 HANDOVER，不在此复制实现契约。
