/**
 * RufusChromeSession
 * 基于 puppeteer 的 Chrome 会话封装，用于与 Amazon Rufus AI 交互
 *
 * 使用方式:
 *   // 方式1：连接到已运行的 Chrome（推荐，保留登录状态）
 *   const session = new RufusChromeSession();
 *   await session.connect(9222);
 *   await session.navigate('https://www.amazon.com/s?k=curtain');
 *
 *   // 方式2：启动新 Chrome（干净实例，无登录状态）
 *   const session = new RufusChromeSession();
 *   await session.launch();
 *   await session.navigate('https://www.amazon.com/s?k=curtain');
 */

import puppeteer from 'puppeteer-core';
import { spawn } from 'child_process';
import fs from 'fs';
import http from 'http';

const DEFAULT_WAIT_MS = 8000;
const RUFUS_TEXTAREA_SELECTOR = '#rufus-text-area';
const RUFUS_CONTENT_SELECTOR = '.nav-rufus-content';

// 自动发现系统 Chrome 路径（跨平台）
function findSystemChrome() {
  const candidates = [
    // Windows
    'C:/Program Files/Google/Chrome/Application/chrome.exe',
    'C:/Program Files (x86)/Google/Chrome/Application/chrome.exe',
    process.env.LOCALAPPDATA && `${process.env.LOCALAPPDATA}/Google/Chrome/Application/chrome.exe`,
    // macOS
    '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome',
    // Linux
    '/usr/bin/google-chrome',
    '/usr/bin/chromium-browser',
    '/usr/bin/chromium',
  ].filter(Boolean);

  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return undefined;
}

// 获取 Chrome DevTools WebSocket 调试地址
function getWsDebuggerUrl(port) {
  return new Promise((resolve, reject) => {
    http.get(`http://127.0.0.1:${port}/json/version`, res => {
      let data = '';
      res.on('data', chunk => data += chunk);
      res.on('end', () => {
        try {
          const info = JSON.parse(data);
          resolve(info.webSocketDebuggerUrl);
        } catch (e) {
          reject(e);
        }
      });
    }).on('error', reject);
  });
}

export class RufusChromeSession {
  constructor(options = {}) {
    this.browser = null;
    this.page = null;
    this.chromeProcess = null;
    this._ownsBrowser = false; // 是否由本 session 启动的 Chrome（close 时决定是否杀进程）
    this.waitMs = options.waitMs || DEFAULT_WAIT_MS;
    this.chromePath = options.chromePath || findSystemChrome();
  }

  /**
   * 连接到已运行的 Chrome 浏览器（推荐方式）
   * 如果已经连接则跳过
   *
   * @param {number} port DevTools 端口，默认 9222
   */
  async connect(port = 9222) {
    // 已连接则跳过
    if (this.browser && this.page) {
      try {
        // 验证连接是否还有效
        await this.page.url();
        return this;
      } catch {
        // 连接已断开，重新连接
        this.browser = null;
        this.page = null;
      }
    }

    console.log(`[RufusChrome] 正在连接到 Chrome (端口 ${port})...`);

    try {
      const wsUrl = await getWsDebuggerUrl(port);
      this.browser = await puppeteer.connect({
        browserWSEndpoint: wsUrl,
        defaultViewport: null,
      });

      // 使用已有的标签页
      const pages = await this.browser.pages();
      this.page = pages.length > 0 ? pages[pages.length - 1] : await this.browser.newPage();

      this._ownsBrowser = false;
      console.log('[RufusChrome] 已连接到 Chrome');
      return this;
    } catch (err) {
      throw new Error(
        `无法连接到 Chrome (端口 ${port})。请确保：\n` +
        `  1. Chrome 已以 --remote-debugging-port=${port} 启动\n` +
        `  2. 运行: scripts/chrome-start.bat 或手动启动 Chrome\n` +
        `  原始错误: ${err.message}`
      );
    }
  }

  /**
   * 启动新的 Chrome 实例（干净启动，无登录状态）
   * 适合不需要登录的场景，或首次使用时手动登录
   *
   * @param {object} options
   * @param {string} options.userDataDir Chrome 用户数据目录（可选）
   * @param {number} options.debugPort 调试端口（默认 19222）
   */
  async launch(options = {}) {
    if (!this.chromePath) {
      throw new Error(
        '未找到 Chrome 浏览器。请安装 Google Chrome，或通过 chromePath 参数指定路径。\n' +
        '支持路径示例：\n' +
        '  Windows: C:/Program Files/Google/Chrome/Application/chrome.exe\n' +
        '  macOS:   /Applications/Google Chrome.app/Contents/MacOS/Google Chrome\n' +
        '  Linux:   /usr/bin/google-chrome'
      );
    }

    const debugPort = options.debugPort || 19222;
    const userDataDir = options.userDataDir;

    if (userDataDir) {
      // 有 userDataDir：手动 spawn + connect
      await this._launchWithProfile(userDataDir, debugPort);
    } else {
      // 无 userDataDir：puppeteer.launch() 干净启动
      await this._launchClean();
    }

    this._ownsBrowser = true;
    console.log('[RufusChrome] Chrome 启动成功');
    return this;
  }

  async _launchClean() {
    this.browser = await puppeteer.launch({
      headless: false,
      executablePath: this.chromePath,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-blink-features=AutomationControlled',
        '--window-size=1440,900',
      ],
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1440, height: 900 });
  }

  async _launchWithProfile(userDataDir, debugPort) {
    const args = [
      `--remote-debugging-port=${debugPort}`,
      '--remote-allow-origins=*',
      '--no-sandbox',
      '--disable-setuid-sandbox',
      '--disable-blink-features=AutomationControlled',
      '--window-size=1440,900',
      `--user-data-dir=${userDataDir}`,
    ];

    this.chromeProcess = spawn(this.chromePath, args, {
      stdio: 'ignore',
      detached: true,
    });

    // 等待 DevTools 就绪
    const start = Date.now();
    let wsUrl;
    while (Date.now() - start < 15000) {
      try {
        wsUrl = await getWsDebuggerUrl(debugPort);
        if (wsUrl) break;
      } catch {}
      await new Promise(r => setTimeout(r, 500));
    }
    if (!wsUrl) throw new Error('等待 Chrome DevTools 超时');

    this.browser = await puppeteer.connect({
      browserWSEndpoint: wsUrl,
      defaultViewport: null,
    });
    this.page = await this.browser.newPage();
    await this.page.setViewport({ width: 1440, height: 900 });
  }

  /**
   * 导航到指定 URL，并自动打开 Rufus 面板
   */
  async navigate(url) {
    if (!this.page) throw new Error('未连接，请先调用 connect() 或 launch()');

    await this.page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
    await this._sleep(5000);

    console.log(`[RufusChrome] 已导航到: ${url}`);

    // 自动打开 Rufus 面板
    await this._ensureRufusPanel();

    return this;
  }

  /**
   * 确保 Rufus 面板已打开
   */
  async _ensureRufusPanel() {
    // 先检查输入框是否已存在（面板已打开）
    const textarea = await this.page.$(RUFUS_TEXTAREA_SELECTOR);
    if (textarea) {
      console.log('[RufusChrome] Rufus 面板已打开');
      return;
    }

    // 面板未打开，点击 Rufus 入口按钮
    console.log('[RufusChrome] 正在打开 Rufus 面板...');
    const discoButton = await this.page.$('#nav-rufus-disco');
    if (discoButton) {
      await discoButton.click();
      // 等待面板加载
      await this._sleep(3000);

      // 确认输入框出现了
      const textareaAfter = await this.page.$(RUFUS_TEXTAREA_SELECTOR);
      if (textareaAfter) {
        console.log('[RufusChrome] Rufus 面板已打开');
        return;
      }
    }

    // 也试试 teaser pill 按钮
    const teaserPill = await this.page.$('.rufus-teaser-cx-pill');
    if (teaserPill) {
      await teaserPill.click();
      await this._sleep(3000);
      const textareaAfter2 = await this.page.$(RUFUS_TEXTAREA_SELECTOR);
      if (textareaAfter2) {
        console.log('[RufusChrome] Rufus 面板已打开（通过 teaser）');
        return;
      }
    }

    console.log('[RufusChrome] 警告: 未能自动打开 Rufus 面板，将在提问时重试');
  }

  /**
   * 向 Rufus 提问并返回回复文本
   */
  async ask(question, waitMs) {
    if (!this.page) throw new Error('未连接，请先调用 connect() 或 launch()');

    const wait = waitMs || this.waitMs;

    // 1. 检查输入框是否存在
    const textarea = await this.page.$(RUFUS_TEXTAREA_SELECTOR);
    if (!textarea) {
      throw new Error('Rufus 输入框未找到，请确认 Rufus 面板已打开');
    }

    // 2. 聚焦并清空
    await this.page.focus(RUFUS_TEXTAREA_SELECTOR);
    await this.page.$eval(RUFUS_TEXTAREA_SELECTOR, el => {
      el.value = '';
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });

    // 3. 输入问题
    await this.page.$eval(RUFUS_TEXTAREA_SELECTOR, (el, q) => {
      el.value = q;
      el.dispatchEvent(new Event('input', { bubbles: true }));
    }, question);

    // 4. 按 Enter 提交
    await this.page.$eval(RUFUS_TEXTAREA_SELECTOR, el => {
      el.dispatchEvent(new KeyboardEvent('keydown', {
        bubbles: true,
        cancelable: true,
        key: 'Enter',
        code: 'Enter',
      }));
    });

    // 5. 等待 Rufus 回复
    console.log(`[RufusChrome] 等待 Rufus 回复: "${question.substring(0, 50)}..."`);
    await this._sleep(wait);

    // 6. 等待 "Rufus has completed" 出现（最多额外等 40 秒）
    try {
      await this.page.waitForFunction(
        () => document.body.textContent.includes('Rufus has completed generating a response'),
        { timeout: 40000 }
      );
      await this._sleep(2000);
    } catch (_) {
      console.log('[RufusChrome] 等待完成标记超时，尝试抓取当前内容');
    }

    // 7. 抓取回复（从 conversation container 获取完整内容）
    const response = await this.page.$eval(
      '#rufus-conversation-container-inner, ' + RUFUS_CONTENT_SELECTOR,
      (panel, q) => {
        // 只取最新一轮对话的内容（最后一次 "Rufus has completed" 标记之后）
        const text = panel.textContent || '';
        const completedMarker = 'Rufus has completed generating a response';
        const lastCompletedPos = text.lastIndexOf(completedMarker);
        if (lastCompletedPos !== -1) {
          return text.substring(lastCompletedPos + completedMarker.length).trim().substring(0, 15000);
        }
        // fallback：按问题定位
        const marker = q.substring(0, 40);
        const pos = text.lastIndexOf(marker);
        return pos === -1
          ? text.substring(Math.max(0, text.length - 15000))
          : text.substring(pos, pos + 15000);
      },
      question
    );

    console.log(`[RufusChrome] 收到回复 (${response.length} 字符)`);
    return response;
  }

  /**
   * 关闭会话
   * - connect 模式：只断开连接，不关闭用户的 Chrome
   * - launch 模式：关闭 Chrome 进程
   */
  async close() {
    if (this.browser) {
      if (this._ownsBrowser) {
        // 本 session 启动的 Chrome，关闭它
        if (this.chromeProcess) {
          try { this.browser.disconnect(); } catch {}
          try { this.chromeProcess.kill(); } catch {}
          this.chromeProcess = null;
        } else {
          await this.browser.close();
        }
        console.log('[RufusChrome] Chrome 已关闭');
      } else {
        // 连接到用户 Chrome，只断开连接
        try { this.browser.disconnect(); } catch {}
        console.log('[RufusChrome] 已断开连接（Chrome 保持运行）');
      }
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * 提取 Rufus 回复中嵌入的产品卡片信息
   * 从 Rufus 面板的 conversation container 中提取产品链接和卡片信息
   */
  async extractProducts() {
    if (!this.page) return [];

    try {
      const products = await this.page.$$eval(
        '#rufus-conversation-container a[href*="/dp/"], #rufus-conversation-container a[href*="/gp/"], ' +
        `${RUFUS_CONTENT_SELECTOR} a[href*="/dp/"], ${RUFUS_CONTENT_SELECTOR} a[href*="/gp/"]`,
        links => {
          const seen = new Set();
          const results = [];
          for (const a of links) {
            const href = a.href || '';
            const asinMatch = href.match(/\/(?:dp|gp\/product)\/([A-Z0-9]{10})/);
            if (!asinMatch) continue;
            const asin = asinMatch[1];
            if (seen.has(asin)) continue;
            seen.add(asin);

            // 向上找产品卡片容器（最多 8 层）
            let card = a;
            let title = '';
            let price = '';
            for (let i = 0; i < 8; i++) {
              if (!card.parentElement) break;
              card = card.parentElement;
              const cls = card.className || '';

              // 尝试从当前层提取标题
              if (!title) {
                const titleEl = card.querySelector(
                  '[data-testid*="title"], [class*="product-title"], [class*="title"], h2, h3, h4'
                );
                if (titleEl && titleEl.textContent.trim().length > 5) {
                  title = titleEl.textContent.trim();
                }
              }

              // 尝试提取价格
              if (!price) {
                const priceText = card.textContent || '';
                const priceMatch = priceText.match(/\$[\d,]+\.?\d*/g);
                if (priceMatch) {
                  // 取第一个有效价格，去重
                  price = [...new Set(priceMatch)][0];
                }
              }

              // 如果找到了标题和价格，或者到了 rufus-card 容器就停止
              if ((title && price) || cls.includes('rufus-card') || cls.includes('rufus-carousel-card')) {
                break;
              }
            }

            // 如果还是没找到标题，用链接文本
            if (!title) {
              title = a.textContent.trim() || a.getAttribute('aria-label') || '';
              // 清理掉价格等干扰文本
              title = title.replace(/\$[\d,]+\.?\d*/g, '').replace(/Price.*$/i, '').trim();
              title = title.substring(0, 200);
            }
            if (!title) title = `[ASIN: ${asin}]`;

            results.push({ asin, title: title.substring(0, 200), price });
          }
          return results;
        }
      );
      return products;
    } catch {
      return [];
    }
  }

  _sleep(ms) {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

export default RufusChromeSession;
