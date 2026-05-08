# Rufus Research

> Amazon Rufus AI 对话自动化调研工具，为 Claude Code 设计的 Skill
>
> An automated research tool that converses with Amazon Rufus AI via Chrome, designed as a Claude Code Skill.

---

## 功能概览 / Features

| 功能 | 说明 |
|------|------|
| 模式A：需求调研 | 输入品类名或问题列表 → 自动生成 10 维度问题 → 逐个问 Rufus → 生成 Markdown 调研报告 |
| 模式B：关键词覆盖率 | 输入关键词列表 → 逐个问 Rufus 推荐产品 → 抓取 ASIN → 生成覆盖率报告 |

**Mode A — Demand Research**: Input category name or questions → auto-generate 10-dimension questions → ask Rufus one by one → generate Markdown research report

**Mode B — Keyword Coverage**: Input keyword list → ask Rufus for product recommendations → extract ASINs → generate coverage report

---

## 前置要求 / Prerequisites

- Node.js v18+
- Chrome 浏览器（Windows / macOS / Linux）
- Claude Code CLI 已安装并配置好 Skill 目录
- Amazon 账号（需登录才能使用 Rufus）

---

## 安装 / Installation

```bash
# 1. 克隆仓库 / Clone the repo
git clone https://github.com/zhangxinxin2323-ui/rufus-research.git
cd rufus-research

# 2. 安装依赖 / Install dependencies
npm install

# 3. 将 skill 目录放到 Claude Code 的 skills 路径下
# Copy to Claude Code skills directory
cp -r . ~/.claude/skills/rufus-research
```

或者直接在 Claude Code 的 skills 目录中克隆：
```bash
cd ~/.claude/skills
git clone https://github.com/zhangxinxin2323-ui/rufus-research.git
cd rufus-research && npm install
```

---

## 使用流程 / Usage

### 第一步 / Step 1：启动 Chrome（每次使用前）

**Windows** — 双击运行：
```bash
scripts/chrome-start.bat
```

**macOS / Linux** — 手动启动：
```bash
# 关闭现有 Chrome / Close existing Chrome
pkill -f "Google Chrome"   # macOS
# taskkill //F //IM chrome.exe  # Windows

# 启动带调试端口的 Chrome / Launch Chrome with debug port
open /Applications/Google\ Chrome.app --args \
  --remote-debugging-port=9222 \
  --remote-allow-origins=* \
  --user-data-dir=/tmp/chrome-debug
```

### 第二步 / Step 2：准备 Amazon 环境

在弹出的 Chrome 窗口中：

1. 登录 Amazon 账号 / Log in to your Amazon account
2. 将邮编改为 **90001**（Rufus 仅在美区邮编下可用）/ Set zip code to **90001**
3. 回到 Claude Code，告诉它 "准备好了" / Go back to Claude Code, say "ready"

### 第三步 / Step 3：在 Claude Code 中使用

#### 模式A：需求调研 / Demand Research

```
/rufus-research 调研 portable espresso machine
```
或给一个具体问题列表。

#### 模式B：关键词覆盖率 / Keyword Coverage

```
/rufus-research 关键词覆盖率 portable espresso machine, travel coffee maker, camping espresso
```

---

## 输出示例 / Output Example

### 模式A 输出 / Mode A Output

```
~/workspace/rufus-{topic}-research/
├── Q1-{topic}.md          # 问题1的 Rufus 完整回复
├── Q2-{topic}.md          # 问题2的 Rufus 完整回复
├── ...
└── SUMMARY-{topic}.md     # 汇总报告（高频追问词 + 品牌统计）
```

### 模式B 输出 / Mode B Output

```
~/workspace/rufus-{topic}-research/
└── COVERAGE-{topic}.md    # 覆盖率报告
    ├── 每个关键词的推荐产品（ASIN + 标题 + 价格）
    ├── ASIN 汇总表（按出现关键词数排序）
    └── 关键词覆盖概览
```

---

## 参数说明 / Configuration

| 参数 | 说明 | 默认值 |
|------|------|--------|
| `topic` | 调研主题（用于文件命名） | `'research'` |
| `saveDir` | 报告保存目录 | `~/workspace/rufus-{topic}-research` |
| `brands` | 需追踪的品牌列表（大小写不敏感） | `[]` |
| `amazonUrl` | Amazon 搜索页 URL | 搜索结果页 |
| `waitMs` | 每个问题等待 Rufus 回复的时间（毫秒） | `8000` |
| `chromePort` | Chrome DevTools 远程调试端口 | `9222` |

---

## 问题设计框架 / Question Design Framework（10 Dimensions）

调研新品类时，自动生成以下 10 个维度的问题：

| # | 维度 | 目的 | Purpose |
|---|------|------|---------|
| 1 | 核心购买因素 | 标题/要点关键词 | Core buying factors → Title keywords |
| 2 | 品类基本概念 | 定价/功能分层 | Category basics → Pricing tiers |
| 3 | 尺寸选购指南 | 产品变体 | Size guide → Variant planning |
| 4 | 风格/颜色趋势 | 标题风格词 | Style trends → Style keywords |
| 5 | 类型/规格对比 | 变体区分 | Type comparison → Variant titles |
| 6 | 功能价值量化 | 功能数据 | Feature quantification → Bullet points |
| 7 | 材质/护理 | 材质关键词 | Material care → Material keywords |
| 8 | 常见问题 | FAQ 素材 | FAQs → Customer concerns |
| 9 | 场景细分 | 多场景关键词 | Use cases → Multi-scenario keywords |
| 10 | 配件/互补品 | 捆绑销售 | Accessories → Bundle hints |

---

## 目录结构 / Project Structure

```
rufus-research/
├── SKILL.md                           # Skill 定义文件
├── README.md                          # 本文档
├── package.json                       # 依赖声明（puppeteer-core）
├── rufus-run-v2.mjs                   # 示例运行脚本
├── references/
│   └── workflow.md                    # 详细技术文档（CDP 协议细节）
└── scripts/
    ├── chrome-start.bat               # Windows 一键启动 Chrome
    ├── rufus-chrome-session.mjs       # Chrome 会话封装（connect/navigate/ask/extract）
    └── rufus-research-runner.mjs      # 调研编排器（run / runKeywordCoverage）
```

---

## 平台兼容 / Platform Support

| 平台 | 支持状态 | 说明 |
|------|----------|------|
| Windows | ✅ 完全支持 | `chrome-start.bat` 一键启动，自动发现 Chrome |
| macOS | ✅ 完全支持 | 自动发现 `/Applications/Google Chrome.app` |
| Linux | ✅ 基本支持 | 需手动安装 Chrome/Chromium |

---

## 已知限制 / Known Limitations

- Rufus 仅在 **登录 + 美国邮编 90001** 状态下才显示推荐产品卡片
- 每个问题建议等待 **8 秒**，过短会丢失回复内容
- Chrome 以调试模式运行时，skill 只断开连接，**不会关闭浏览器**
- Rufus 界面元素（输入框 ID、面板 class）可能随 Amazon 更新而变化

---

## 常见问题 / Troubleshooting

| 问题 | 原因 | 解决方案 |
|------|------|----------|
| `INPUT_NOT_FOUND` | Rufus 面板未打开 | 手动点击页面左下角 Rufus 按钮 |
| Enter 提交无反应 | 事件缺少 `bubbles: true` | 重新运行，脚本已处理此问题 |
| 抓不到回复 | 等待时间不足 | 确认页面出现 "Rufus has completed" 文本 |
| WS 500 Error | 页面 ID 变化 | 重新创建页面：`curl -X PUT http://127.0.0.1:9222/json/new` |
| 端口被占用 | 已有 Chrome 实例 | 先关闭所有 Chrome，再以调试模式启动 |

---

## License

MIT
