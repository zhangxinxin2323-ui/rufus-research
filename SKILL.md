---
name: rufus-research
description: |
  通过 Chrome 浏览器自动化与 Amazon Rufus AI 对话，收集品类用户痛点和需求，生成 Listing 优化 + Rufus GEO 调研报告。

  两种模式：
  - 模式A 需求调研：用户给问题列表或品类名 → 设计10维度问题 → 逐个问 Rufus → 生成调研报告
  - 模式B 关键词覆盖率：用户给关键词列表 → 逐个问 Rufus 推荐产品 → 抓取所有推荐 ASIN → 生成覆盖率报告

  触发条件：
  - 模式A："调研 Rufus"、"用 Rufus 分析 [品类]"、"收集 Rufus 回答"、"调研 [品类] 用户关心什么"、给问题列表
  - 模式B："关键词覆盖率"、"关键词收录"、"检测关键词推荐"、"用 Rufus 跑这些关键词"、给纯关键词列表
  - 模式A/B均可："帮我设计问题"然后"和 Rufus 聊"

  触发词：rufus-research, rufus 调研, rufus分析, rufus调研, 关键词覆盖率, 关键词收录
user-invocable: true
allowed-tools: [Bash, Read, Write, Edit, AskUserQuestion, Glob, Grep]
risk-level: medium
---

# Rufus Research Skill

通过 puppeteer 连接 Chrome 浏览器，控制 Amazon Rufus AI 进行品类调研，收集数据并生成 Markdown 报告。

## 前置条件

- 已安装 Node.js (v18+)
- 已安装 Chrome 浏览器
- 首次运行需要 `npm install`（在 skill 目录下安装 puppeteer-core 依赖）

## 安装

```bash
cd ~/.claude/skills/rufus-research
npm install
```

## 目录结构

```
scripts/
├── rufus-chrome-session.mjs   # Chrome 会话封装（connect/navigate/ask/extractProducts）
├── rufus-research-runner.mjs  # 调研编排器（run/runKeywordCoverage 方法）
└── chrome-start.bat           # Windows 一键启动脚本
```

## 使用流程

### 第一步：启动 Chrome（每次使用前）

运行一键启动脚本：

```bash
cd ~/.claude/skills/rufus-research
scripts/chrome-start.bat
```

脚本会：
1. 关闭所有 Chrome 进程
2. 创建专用调试 profile（`RufusDebug`）
3. 以 `--remote-debugging-port=9222` 启动 Chrome

启动后，在弹出的 Chrome 窗口中：
1. 登录 Amazon 账号
2. 将邮编改为 90001
3. 回到 Claude Code 告诉我"准备好了"

**手动启动方式**（如果 bat 脚本不适用）：

```bash
taskkill //F //IM chrome.exe
"C:/Program Files/Google/Chrome/Application/chrome.exe" --remote-debugging-port=9222 --remote-allow-origins=* --user-data-dir="%LOCALAPPDATA%/Google/Chrome/User Data/RufusDebug"
```

### 第二步：在 Claude Code 中使用

skill 会自动连接到已运行的 Chrome（端口 9222），导航到 Amazon，打开 Rufus 面板，进行问答。

## 参数说明

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `topic` | 调研主题（用于文件名） | `'research'` |
| `saveDir` | 报告保存目录 | `~/workspace/rufus-{topic}-research` |
| `brands` | 要追踪的品牌列表（大小写不敏感匹配） | `[]` |
| `amazonUrl` | Amazon 搜索页 URL | 搜索页 |
| `waitMs` | 每个问题等待 Rufus 回复的时间（ms） | `8000` |
| `chromePort` | Chrome DevTools 端口 | `9222` |

## 输出文件

运行后在 `saveDir` 下生成：

### 需求调研模式（`run()`）

- `Q1-{topic}.md`, `Q2-{topic}.md`, ... — 每个问题的详细 Rufus 回复
- `SUMMARY-{topic}.md` — 汇总报告（高频追问词 + 竞品品牌统计 + 各问题概要）

### 关键词覆盖率模式（`runKeywordCoverage()`）

- `COVERAGE-{topic}.md` — 覆盖率报告，包含：
  - 每个关键词的推荐产品列表（ASIN + 标题 + 价格）
  - 全部 ASIN 汇总表（按出现关键词数排序）
  - 关键词覆盖概览（每个关键词推荐了多少产品）

## 关键词覆盖率检测

批量检测核心关键词下 Rufus 推荐了哪些产品，用于判断自己的产品是否被收录。

### 工作流程

```
每个关键词 → 自动转为自然语言问题 → Rufus 推荐 → 抓取所有推荐产品（ASIN + 标题 + 价格）
```

你拿到报告后，对照自己的 ASIN 判断是否被 Rufus 收录。

## 问题设计框架（10 个维度）

每调研一个新品类，设计 10 个问题覆盖以下维度：

| # | 维度 | 目的 |
|---|------|------|
| 1 | 核心购买因素 | 标题/要点关键词 |
| 2 | 品类基本概念/档次 | 定价/功能分层 |
| 3 | 尺寸选购指南 | 产品变体/描述 |
| 4 | 风格/颜色趋势 | 标题颜色词/风格词 |
| 5 | 类型/规格对比 | 变体标题区分 |
| 6 | 功能价值量化 | 要点功能数据 |
| 7 | 材质/护理 | 材质关键词/描述 |
| 8 | 常见问题 | FAQ 内容素材 |
| 9 | 场景细分 | 多场景关键词 |
| 10 | 配件/互补品 | 捆绑销售提示 |

## 平台兼容

- **Windows**：自动发现 Chrome，`chrome-start.bat` 一键启动
- **macOS**：自动发现 Chrome（`/Applications/Google Chrome.app/Contents/MacOS/Google Chrome`）
- **Linux**：需要安装 Chrome/Chromium

## 已知限制

- Rufus 只在登录 + 美国邮编 90001 状态下才显示推荐产品
- Rufus 回复等待时间建议 8 秒，过短会漏掉内容
- connect 模式下 Chrome 保持运行，skill 只断开连接不关闭浏览器
