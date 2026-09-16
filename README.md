# 科研前沿雷达 · Research Radar

按学科聚合**人工智能**与**遥感**领域顶级期刊与预印本的最新文献，**摘要与配图重点呈现**的网页应用。
一个链接即可分享，手机浏览器打开即用。

---

## 快速开始

```bash
npm install        # 安装依赖
npm start          # 首次运行会自动构建前端并抓取数据
```

打开 <http://localhost:8787> 即可。首次启动需要抓取 30 余本期刊与预印本，通常 **1–3 分钟**，页面会实时显示进度。

```bash
npm run refresh    # 手动跑一次完整抓取（命令行）
npm run harvest    # 重新抓取期刊指标（OpenAlex）
npm run config     # 用新指标重新生成 journals.json
```

> 端口 8787 被占用时会自动顺延到 8788、8789……

---

## 功能

| 能力 | 实现方式 |
| --- | --- |
| **分学科获取** | 学科配置驱动，默认「人工智能」「遥感」，新增学科只改配置 |
| **顶刊优先** | 期刊白名单 + 可调门槛（默认按近两年篇均被引 ≥9 / ≥6 过滤） |
| **最新文献** | 按发表日期倒序，可选 7/14/30/90 天窗口，每 6 小时自动增量更新 |
| **分类浏览** | 学科标签页 + 期刊标签 + 时间/来源/排序筛选 + 全文搜索 |
| **摘要重点显示** | OpenAlex → Crossref 双源补全，独立高亮区块、默认展开、一键复制 |
| **配图重点显示** | arXiv 开放获取预印本的正文配图，缩略图条 + 全屏灯箱 + 「图片优先」视图 |
| **深色模式** | 跟随系统，可手动切换并记忆 |

快捷键：`Esc` 关闭图片灯箱，`←` `→` 切换上一张/下一张。

---

## 数据来源与合规

| 来源 | 用途 | 说明 |
| --- | --- | --- |
| [OpenAlex](https://openalex.org) | 期刊元数据、摘要、开放获取链接、期刊被引指标 | 免费开放 API，无需密钥 |
| [arXiv](https://arxiv.org) | 预印本元数据与**正文配图** | 开放获取 |
| [Crossref](https://www.crossref.org) | 摘要补全 | 免费开放 API |

**关于「篇均被引」**：JCR 影响因子是付费数据，本项目改用 OpenAlex 的 *2-year mean citedness*（近两年篇均被引）作为免费替代口径。它与官方影响因子高度相关但数值略有出入，界面上标注为「篇均被引」而非「影响因子」。

**关于配图版权**：只抓取并展示开放获取预印本（arXiv）的正文配图。订阅制期刊的正文插图受版权保护，本应用**不抓取、不转载**，卡片上给出 DOI 链接。

**关于机构订阅**：本应用**不做任何需要账号登录的抓取**。付费期刊只索引元数据与摘要，全文通过 DOI 跳转，由访问者用自己的机构权限查看——这样应用可以公开分享，也不会因批量下载触发出版商风控。

---

## 新增一个学科

编辑项目根目录的 `journals.json`，复制一段 `disciplines` 即可，前端会自动出现新标签页，**无需改代码**：

```jsonc
{
  "id": "bio",
  "name": "生命科学",
  "nameEn": "Life Sciences",
  "blurb": "一句话说明",
  "defaultThreshold": 10,
  "arxivQuery": "cat:q-bio.BM OR cat:q-bio.GN",
  "arxivCategories": ["q-bio.BM", "q-bio.GN"],
  "keywords": [],
  "journals": [
    { "name": "Nature Biotechnology", "short": "Nat. Biotech.", "issn": "1087-0156", "citedness": 40.2, "core": true }
  ]
}
```

- `defaultThreshold`：默认门槛，界面上可用滑杆实时调整。
- `arxivQuery`：arXiv 检索式；遥感这类没有专属分类的学科，可用 `all:"remote sensing" OR ...` 做元数据检索。
- `journals[].citedness`：填 OpenAlex 的 2 年平均被引；想批量更新，把 ISSN 加进 `scripts/harvest-journals.mjs` 的候选表再跑 `npm run harvest && npm run config`。

---

## 发布到公网（零成本方案：GitHub Pages + 定时重建）

这是**不需要服务器、不需要域名、不需要备案**的方案：抓取在 GitHub Actions 里定时执行，
结果与前端一起打包成纯静态站点发布。浏览器端只需加载一个 JSON，没有任何后端进程。

### 原理

```
GitHub Actions（每 6 小时）
   └─ npm run refresh       抓取 OpenAlex / Crossref / arXiv
        └─ npm run build:static   导出静态 JSON + 打包前端 → web/dist-static/
             └─ 发布到 GitHub Pages
```

### 一次性配置（约 5 分钟）

1. **建仓库**：GitHub 上新建一个仓库。免费账号的 Pages 只对 **Public** 仓库开放，所以**建议选 Public**。
2. **推送代码**（把 `<你的用户名>` 和 `<仓库名>` 替换掉）：
   ```bash
   git init -b main
   git add .
   git commit -m "科研前沿雷达：初始版本"
   git remote add origin https://github.com/<你的用户名>/<仓库名>.git
   git push -u origin main
   ```
3. **开启 Pages（必做，且必须在第一次成功部署之前）**：
   仓库 → **Settings** → 左侧 **Pages** → Build and deployment → **Source** 选 **GitHub Actions**。
   这一步无法由 workflow 自动完成——实测 `actions/configure-pages` 的 `enablement: true`
   在仓库尚未开通 Pages 时会直接失败，所以必须手动点一次。
4. **等第一次构建**：推送代码本身就会触发一次；也可以到仓库 → Actions →「抓取并发布」→ Run workflow 手动触发。
   首次约 4–6 分钟（要抓 30 余本期刊 + 提取配图）。
5. 得到一个永久链接：`https://<你的用户名>.github.io/<仓库名>/`

之后每 6 小时会自动重建一次，`.github/workflows/deploy.yml` 里的 `cron` 可以按需调整。

### 两种运行形态

同一套前端支持两种形态，构建产物互不覆盖：

| | 命令 | 产物 | 数据来源 |
| --- | --- | --- | --- |
| 本地服务 | `npm start` | `web/dist/` | `/api/*`，可点按钮实时抓取 |
| 静态发布 | `npm run build:static` | `web/dist-static/` | 随站点发布的 `data/*.json` |

静态形态下顶部按钮会变成「手动更新」，点击跳转到 GitHub Actions 页面触发一次重建
（该链接来自 CI 环境变量，本地构建时不显示）。

### 注意事项

- **定时任务会被暂停**：GitHub 在仓库连续 60 天没有提交后会自动停用定时工作流。
  届时在 Actions 页面点一次 Run workflow，或随便推一个提交即可恢复。站点本身不会挂，只是停止更新。
- **国内访问**：GitHub Pages 在国内时快时慢。如果主要给国内同行用，见下面「国内访问更稳的方案」。
- **缓存**：workflow 用 `actions/cache` 保留了配图缓存，让 arXiv 图源能跨次累积，而不是每次只抓最新的几十篇。

### 其他部署方式

- **云平台常驻进程**（Railway / Render / Fly.io）：项目是单个 Node 进程，已附 `Dockerfile`，连上仓库即可。
  优点是能实时抓取，缺点是 Railway 需绑卡、Render 免费档 15 分钟无访问会休眠。
  ```bash
  docker build -t research-radar . && docker run -d -p 8787:8787 research-radar
  ```
- **国内访问更稳的方案**：租一台香港/新加坡轻量服务器（约 ¥150–350/年，免备案），
  `git clone` 后 `npm ci && npm run build && npm start`，用 Nginx 反代到 8787。
  用国内节点则域名需要 ICP 备案（1–3 周）。
- **临时演示**：`cloudflared tunnel --url http://localhost:8787` 立刻得到临时公网链接，关掉即失效。
- **同一局域网**：手机连同一 WiFi 访问 `http://<本机内网IP>:8787`，出了这个网络就打不开。

---

## 目录结构

```
journals.json              学科与期刊白名单（唯一需要改的配置）
server/
  index.mjs                HTTP 服务：API + 图片代理 + 静态前端 + 定时刷新（仅本地服务形态）
  lib/
    config.mjs             配置加载
    openalex.mjs           期刊论文抓取（主通道）
    crossref.mjs           期刊发现第二通道 + 摘要补全
    arxiv.mjs              预印本抓取
    semanticscholar.mjs    摘要兜底
    figures.mjs            预印本配图提取（含磁盘缓存）
    refresh.mjs            抓取管线：拉取 → 合并去重 → 补摘要 → 提图 → 落盘
    util.mjs               文本清洗（LaTeX 残留、摘要还原）等
scripts/
  harvest-journals.mjs     抓取期刊指标
  build-config.mjs         生成 journals.json
  refresh-once.mjs         命令行手动抓取
  export-static.mjs        导出随站点发布的静态 JSON
web/
  src/api.js               数据访问层：服务器模式 / 静态模式 的唯一差异点
  dist/                    本地服务形态的构建产物
  dist-static/             静态发布形态的构建产物
.github/workflows/deploy.yml   定时抓取 + 打包 + 发布到 GitHub Pages
data/                      运行时缓存（papers.json / figures.json，可删）
```

---

## 环境变量

| 变量 | 默认 | 说明 |
| --- | --- | --- |
| `PORT` | `8787` | 服务端口 |
| `RADAR_MAILTO` | `research-radar@example.com` | 请求 OpenAlex/Crossref 时附带的联系邮箱，建议改成你自己的（可进入更稳定的「礼貌池」） |

---

## 数据可得性实测（重要，决定了你能看到什么）

这些结论都是本项目在开发时用真实 API 跑出来的，不是猜测：

**1. 摘要覆盖率约 50%，瓶颈在出版商而非代码。**
OpenAlex 对多数期刊的摘要覆盖并不完整。实测某次抓取：Nature MI 9/25、ISPRS J 11/25、RSE 25/50，而 Elsevier 系的
Information Fusion、Pattern Recognition、Knowledge-Based Systems、Expert Systems with Applications
**几乎完全不提供摘要**（个别刊物低于 10%）。本项目用 OpenAlex → Crossref → Semantic Scholar 三源合并补全，
仍无法突破出版商的数据政策。缺失时卡片会明确写「该来源未提供摘要」并给出原文链接，不会静默留白。

**2. 部分期刊向开放索引供货延迟，会出现「近 N 天无新论文」。**
实测某些 IEEE 期刊的收录会阶段性停滞（例如 TGRS 一度停更数月）。本项目用 Crossref 的 DOI 注册数据作第二条发现通道，
把 TGRS 从 0 篇补到 249 篇。即便如此，仍会有刊物在某个窗口内确实没有新内容，侧边栏会用**虚线标签**标出来，
鼠标悬停可看到该刊最新被收录的日期。

**3. 配图只来自开放获取预印本。**
arXiv 只有 2023 年 12 月之后的论文有 HTML 版，更早的预印本提不到配图。订阅制期刊的正文插图受版权保护，
本应用不抓取、不转载——这是设计决策，不是缺陷。

**4. 首次加载约 1.6 MB（gzip 后）。**
库内约 3700–4000 篇文献含完整摘要。服务端开启了 gzip 与 ETag，**再次访问命中 304，不重复传输**；
数据每 6 小时更新一次时才会重新下载。

---

## 常见问题

**浏览器打开是 502 / 连不上？**
多半是系统代理拦截了 localhost。终端里可用 `curl --noproxy '*' http://127.0.0.1:8787/` 验证服务是否正常；
浏览器请把 `localhost` / `127.0.0.1` 加入代理例外（Chrome/Edge 默认已豁免，Clash 等代理工具需在规则里放行）。

**想改抓取窗口或刷新频率？**
编辑 `journals.json` 顶层的 `windowDays`（默认 90 天）与 `refreshIntervalHours`（默认 6 小时）。

**想换成我自己的邮箱？**
设置环境变量 `RADAR_MAILTO=you@example.com`。OpenAlex/Crossref 会据此把请求归入更稳定的「礼貌池」。
