# Rufus 调研 - 详细操作流程

> **注意**：当前 skill 使用 `puppeteer-core` 自动化方案，以下手动 CDP 操作仅供参考。
> 实际运行请直接使用 `scripts/rufus-research-runner.mjs`。

本文档是 rufus-research skill 的参考手册，包含完整操作细节。

---

## Chrome 调试环境准备

### 启动命令

```bash
# 杀掉现有 Chrome
pkill -f "Google Chrome"
sleep 1

# 启动带调试端口的 Chrome
open /Applications/Google\ Chrome.app --args \
  --remote-debugging-port=9222 \
  --remote-allow-origins=\* \
  --user-data-dir=/tmp/chrome-debug
sleep 4

# 验证启动成功
curl -s http://127.0.0.1:9222/json/version
# 应返回 {"Browser": "Chrome/xxx", ...}
```

### 创建新页面（避免复用旧页面状态）

```bash
# PUT 请求创建新页面，返回 page id 和 ws url
curl -s -X PUT http://127.0.0.1:9222/json/new
# 返回: {"id":"xxx","webSocketDebuggerUrl":"ws://127.0.0.1:9222/devtools/page/xxx",...}
```

### WebSocket 连接

```javascript
import WebSocket from 'ws';

const ws = new WebSocket('ws://127.0.0.1:9222/devtools/page/[PAGE_ID]');
ws.on('open', () => console.log('Connected'));
```

---

## 导航并触发 Rufus

### 导航

```javascript
send('Page.navigate', { url: 'https://www.amazon.com/s?k=curtain&s=review-rank' });
await sleep(5000); // 等待页面加载
```

### 判断 Rufus 是否可用

 Rufus 加载完成后，左下角会出现 Rufus 按钮（浮动在搜索结果左侧）。

---

## 找到 Rufus 输入框

 Rufus 面板打开后，输入框的 HTML 属性：

```javascript
// 在页面中搜索 placeholder 含 "Ask" 或 "Rufus" 的元素
send('Runtime.evaluate', {
  expression: `
  (function() {
    const all = document.querySelectorAll("input, textarea");
    const results = [];
    all.forEach(el => {
      const ph = el.placeholder || "";
      if (ph.toLowerCase().includes("ask") || ph.includes("Rufus")) {
        const rect = el.getBoundingClientRect();
        results.push({
          id: el.id,
          placeholder: ph,
          visible: el.offsetParent !== null,
          top: Math.round(rect.top),
          left: Math.round(rect.left)
        });
      }
    });
    return JSON.stringify(results);
  })()
  `,
  returnByValue: true
});
```

**已知稳定的元素标识：**
- `id="rufus-text-area"` — Rufus 聊天输入框（textarea）
- Rufus 面板容器：`class="nav-rufus-content"`

---

## 发送问题并收集回复

### 完整流程（单次）

```javascript
// 1. 写入问题
send('Runtime.evaluate', {
  expression: `
  (function() {
    const ta = document.getElementById("rufus-text-area");
    if (!ta) return "NOT_FOUND";
    ta.focus();
    ta.value = "";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    ta.value = "What are the most important factors when buying curtains for a bedroom?";
    ta.dispatchEvent(new Event("input", { bubbles: true }));
    return "TYPED: " + ta.value;
  })()
  `,
  returnByValue: true
});

// 2. 模拟 Enter 提交（必须 bubbles: true）
send('Runtime.evaluate', {
  expression: `
  (function() {
    const ta = document.getElementById("rufus-text-area");
    ta.dispatchEvent(new KeyboardEvent("keydown", {
      bubbles: true,   // 必须为 true，Rufus 才能收到
      cancelable: true,
      key: "Enter",
      code: "Enter"
    }));
    return "ENTER_PRESSED";
  })()
  `,
  returnByValue: true
});

// 3. 等待回复
await sleep(8000); // Rufus 通常 5-8 秒生成完毕

// 4. 抓取回复
send('Runtime.evaluate', {
  expression: `
  (function() {
    const panel = document.querySelector(".nav-rufus-content");
    if (!panel) return "PANEL_NOT_FOUND";
    const text = panel.textContent || "";
    // 从问题关键词位置开始取，避免取到旧内容
    const marker = "What are the most important factors when buying";
    const pos = text.indexOf(marker);
    return pos === -1
      ? text.substring(Math.max(0, text.length - 5000))
      : text.substring(pos, pos + 5000);
  })()
  `,
  returnByValue: true
});
```

### 判断 Rufus 回复完成

页面 DOM 中出现 `Rufus has completed generating a response` 文本时，表示回复已完成。

---

## 轮询等待回复（更可靠的方式）

```javascript
async function waitForRufus(maxWaitMs = 15000, intervalMs = 1000) {
  const start = Date.now();
  while (Date.now() - start < maxWaitMs) {
    const r = send('Runtime.evaluate', {
      expression: `
        (function() {
          const text = document.body.textContent || "";
          return text.includes("Rufus has completed generating a response") ? "DONE" : "WAITING";
        })()
      `,
      returnByValue: true
    });
    if (r?.result?.value === 'DONE') break;
    await sleep(intervalMs);
  }
}
```

---

## 回复解析规则

Rufus 回复通常包含以下部分：

### 1. 原文（Original Answer）
英文回复主体，以 `\n\n` 或 `\nHere'` 等为分隔。保留完整原文。

### 2. Rufus 追问建议（Follow-ups）
出现在回复末尾，以链接形式出现。特征关键词：
- `Show ... options`
- `Best ... available`
- `How to ...`
- `What ...`
- `Compare ... vs ...`
- `How much ...`

### 3. 提及的产品/品牌
Rufus 会在回答中间嵌入 Amazon 产品卡片，常见品牌：
- NICETOWN、MIULEE、Yakamok、Melodieux

### 4. 价格区间
RufUS 给品类价格范围，如 `$15-80 per pair`

### 5. Comparison Table
Rufus 常用表格对比功能/特性，如遮光率对比表。

---

## 常见错误排查

| 错误 | 原因 | 解决 |
|------|------|------|
| `INPUT_NOT_FOUND` | Rufus 面板未打开 | 先手动点 Rufus 按钮打开面板 |
| Enter 提交无反应 | `bubbles: true` 缺失 | 必须加 `bubbles: true` |
| 抓不到回复 | 等的时间不够 | 至少等 8 秒，确认有 "Rufus has completed" 文本 |
| WS 500 Internal Error | 页面 ID 变了 | `curl /json/new` 获取新 ID |
| Chrome 无法启动 | 权限问题 | 检查 Chrome 是否在 Applications |
| 端口被占用 | 已有 Chrome 实例 | `pkill -f "Google Chrome"` 后重试 |

---

## 完整问题设计框架（窗帘类目示例）

根据窗帘调研经验，10 个核心问题维度：

1. **关键购买因素** — Bedroom 场景最重要因素
2. **品类基本概念** — Blackout / Light-filtering / Sheer 区别
3. **尺寸选购** — 1.5-2x 宽度 / 84" 标准
4. **风格颜色趋势** — 客厅流行风格和颜色
5. **悬挂类型对比** — Grommet / Rod Pocket / Pinch Pleat
6. **功能价值** — 隔热保温 / 节能
7. **材质护理** — 易打理材质排序
8. **常见问题** — 8 个常见问题及避免方法
9. **场景细分** — 婴儿房/卧室特殊需求
10. **配件清单** — 购买窗帘需要哪些配件
