# lzhdev.com/utils — 项目规划文档

> 版本 v0.4 · 2026-10-04 · 维护者：Zihao Liu ([lzhdev.com](https://lzhdev.com))
> 状态：规划阶段（M0）。本文档是项目的决策记录与规划总纲，随里程碑推进更新。

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

- 应用暴露 `/api/health`（容器 healthcheck 也走它）
- `deploy.sh` 成功后 ping healthchecks.io（死信开关：部署没跑或没跑完会告警）
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

### 目录结构（M1 落地）

```
src/app/...           # 页面与 Route Handlers
src/lib/...           # 共享逻辑
docs/                 # 本文档等内部文档
deploy/               # Dockerfile、docker-compose.yml、deploy.sh、(可选) receiver.mjs
.github/workflows/    # CI/CD
```

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
| **M2** | 服务器反代 + DNS/TLS | https://utils.lzhdev.com 可访问 |
| **M3** | CI/CD 流水线 | push main 全自动上线；回滚预案演练一次 |
| **M4** | 产品功能 | 家人鉴权 + **Agent chat（核心：浏览器 ↔ 服务器端 Claude Code）** + AI 代理端点 + skills 加载 + 首批工具 |
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
