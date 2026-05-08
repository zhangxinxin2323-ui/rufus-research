/**
 * RufusResearchRunner
 * Rufus 调研流程编排器（基于 RufusChromeSession）
 *
 * 使用方式:
 *   import { RufusResearchRunner } from './rufus-research-runner.mjs';
 *
 *   const runner = new RufusResearchRunner({
 *     topic: 'curtain',
 *     saveDir: '~/workspace/rufus-curtain-research',
 *     brands: ['NICETOWN', 'MIULEE', 'Yakamok'],
 *   });
 *   await runner.run(questions);
 */

import fs from 'fs';
import path from 'path';
import { RufusChromeSession } from './rufus-chrome-session.mjs';

const DEFAULT_WAIT_MS = 8000;

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

function ensureDir(dir) {
  const home = process.env.HOME || process.env.USERPROFILE || process.env.HOMEPATH || '';
  const expanded = dir.replace(/^~/, home);
  if (!fs.existsSync(expanded)) {
    fs.mkdirSync(expanded, { recursive: true });
  }
  return expanded;
}

export class RufusResearchRunner {
  /**
   * @param {object} options
   * @param {string} options.topic 调研主题（如 curtain）
   * @param {string} options.saveDir 保存目录
   * @param {string[]} options.brands 要追踪的品牌列表（可选）
   * @param {string} options.amazonUrl Amazon 搜索 URL（可选）
   * @param {number} options.waitMs 每个问题的等待时间（可选，默认 8000）
   * @param {number} options.chromePort Chrome DevTools 端口（默认 9222，连接已运行的 Chrome）
   */
  constructor(options = {}) {
    this.topic = options.topic || 'research';
    this.saveDir = ensureDir(options.saveDir || `~/workspace/rufus-${this.topic}-research`);
    this.brands = options.brands || [];
    this.amazonUrl = options.amazonUrl || 'https://www.amazon.com/s?k=curtain&s=review-rank';
    this.waitMs = options.waitMs || DEFAULT_WAIT_MS;
    this.chromePort = options.chromePort || 9222;

    this.session = new RufusChromeSession({
      waitMs: this.waitMs,
    });

    this.responses = [];
  }

  // ─── 主流程 ───────────────────────────────────────

  /**
   * 执行完整调研流程
   * @param {string[]} questions 问题列表（英文）
   * @returns {Promise<object[]>} 每个问题的分析结果
   */
  async run(questions) {
    console.log(`\n========== Rufus 调研开始: ${this.topic} ==========\n`);

    try {
      // 1. 连接到已运行的 Chrome
      await this.session.connect(this.chromePort);

      // 2. 导航 Amazon
      await this.session.navigate(this.amazonUrl);

      // 3. 逐个提问
      const results = [];
      for (let i = 0; i < questions.length; i++) {
        const q = questions[i];
        console.log(`\n--- Q${i + 1}/${questions.length}: ${q.substring(0, 60)}...`);

        try {
          const raw = await this.session.ask(q);
          const parsed = this._parse(raw, q);

          this._saveLocally(i + 1, q, raw, parsed);
          results.push(parsed);
          this.responses.push({ question: q, raw, parsed });
        } catch (err) {
          console.error(`  Q${i + 1} 失败: ${err.message}`);
          results.push({
            question: q,
            raw: '',
            followUps: [],
            brands: [],
            prices: [],
            rawLength: 0,
            error: err.message,
          });
        }

        await sleep(2000);
      }

      // 4. 保存汇总报告
      this._saveSummary(questions, results);

      console.log(`\n========== Rufus 调研完成: ${this.topic} ==========`);
      console.log(`报告已保存至: ${this.saveDir}`);
      return results;
    } catch (err) {
      console.error(`\n========== Rufus 调研失败: ${this.topic} ==========`);
      throw err;
    } finally {
      await this.session.close();
    }
  }

  // ─── 关键词覆盖率检测 ────────────────────────────────

  /**
   * 关键词覆盖率检测
   * 对每个关键词自动构造问题，询问 Rufus 推荐产品，抓取所有推荐结果
   * @param {string[]} keywords 关键词列表
   * @returns {Promise<object[]>} 每个关键词的推荐产品列表
   */
  async runKeywordCoverage(keywords) {
    console.log(`\n========== Rufus 关键词覆盖率检测: ${this.topic} ==========\n`);
    console.log(`关键词数量: ${keywords.length}\n`);

    try {
      await this.session.connect(this.chromePort);
      await this.session.navigate(this.amazonUrl);

      const results = [];
      for (let i = 0; i < keywords.length; i++) {
        const kw = keywords[i];
        const question = this._keywordToQuestion(kw);
        console.log(`\n--- [${i + 1}/${keywords.length}] ${kw}`);
        console.log(`    问题: ${question}`);

        try {
          const raw = await this.session.ask(question);
          const products = await this.session.extractProducts();

          const entry = {
            keyword: kw,
            question,
            products,
            productCount: products.length,
            rawLength: raw.length,
          };
          results.push(entry);

          console.log(`    推荐产品: ${products.length} 个`);
          for (const p of products) {
            console.log(`      ${p.asin} | ${p.title.substring(0, 60)}`);
          }
        } catch (err) {
          console.error(`    失败: ${err.message}`);
          results.push({
            keyword: kw,
            question,
            products: [],
            productCount: 0,
            error: err.message,
          });
        }

        await sleep(2000);
      }

      this._saveCoverageReport(keywords, results);

      console.log(`\n========== 关键词覆盖率检测完成 ==========`);
      console.log(`报告已保存至: ${this.saveDir}`);
      return results;
    } catch (err) {
      console.error(`\n========== 关键词覆盖率检测失败 ==========`);
      throw err;
    } finally {
      // 断开 puppeteer 连接（不关闭 Chrome），让 Node 进程正常退出
      await this.session.close();
    }
  }

  /**
   * 将关键词转为 Rufus 会回答的自然语言问题
   * @param {string} keyword
   * @returns {string}
   */
  _keywordToQuestion(keyword) {
    const kw = keyword.trim();

    // 场景/用途类关键词
    const scenePatterns = /^(camping|travel|outdoor|office|home|kitchen|baby|car|van|portable|indoor)/i;
    if (scenePatterns.test(kw)) {
      return `What are the best ${kw} products you would recommend?`;
    }

    // 功能/特性类关键词
    const featurePatterns = /^(self-heating|rechargeable|wireless|automatic|adjustable|waterproof|foldable|portable|cordless|smart)/i;
    if (featurePatterns.test(kw)) {
      return `Which products have ${kw} features that customers recommend?`;
    }

    // 对比/类型类关键词
    const typePatterns = /\b(vs|versus|or|manual|electric|digital|stainless|mini|large)\b/i;
    if (typePatterns.test(kw)) {
      return `What is the best ${kw} option available?`;
    }

    // 默认：品类推荐
    return `What are the best ${kw} options to consider?`;
  }

  /**
   * 保存关键词覆盖率报告
   */
  _saveCoverageReport(keywords, results) {
    const safeTopic = this.topic.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const reportPath = path.join(this.saveDir, `COVERAGE-${safeTopic}.md`);

    let content = `# Rufus 关键词覆盖率报告: ${this.topic}\n\n`;
    content += `**检测时间：** ${new Date().toISOString().split('T')[0]}\n`;
    content += `**关键词数量：** ${keywords.length}\n`;
    content += `**有效结果：** ${results.filter(r => !r.error).length}/${keywords.length}\n\n---\n\n`;

    // 汇总表
    content += `## 关键词覆盖概览\n\n`;
    content += `| # | 关键词 | 推荐产品数 | 状态 |\n`;
    content += `|---|--------|-----------|------|\n`;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      const status = r.error ? `❌ ${r.error.substring(0, 30)}` : '✅';
      content += `| ${i + 1} | ${r.keyword} | ${r.productCount} | ${status} |\n`;
    }

    // 全部 ASIN 汇总
    const allAsins = new Map();
    for (const r of results) {
      for (const p of r.products) {
        if (!allAsins.has(p.asin)) {
          allAsins.set(p.asin, { title: p.title, price: p.price, keywords: [] });
        }
        allAsins.get(p.asin).keywords.push(r.keyword);
      }
    }

    content += `\n---\n\n## 全部推荐产品 ASIN 汇总 (${allAsins.size} 个不同产品)\n\n`;
    content += `| ASIN | 产品标题 | 出现关键词数 | 关键词 |\n`;
    content += `|------|---------|------------|--------|\n`;
    const sortedAsins = [...allAsins.entries()].sort((a, b) => b[1].keywords.length - a[1].keywords.length);
    for (const [asin, info] of sortedAsins) {
      const title = info.title.substring(0, 60).replace(/\|/g, '\\|');
      content += `| ${asin} | ${title} | ${info.keywords.length} | ${info.keywords.slice(0, 5).join(', ')}${info.keywords.length > 5 ? '...' : ''} |\n`;
    }

    // 每个关键词的详细结果
    content += `\n---\n\n## 每个关键词详细推荐\n\n`;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      content += `### ${i + 1}. "${r.keyword}"\n\n`;
      content += `**问题：** ${r.question}\n\n`;

      if (r.error) {
        content += `**错误：** ${r.error}\n\n`;
        continue;
      }

      if (r.products.length === 0) {
        content += `*Rufus 未推荐任何产品*\n\n`;
        continue;
      }

      content += `| # | ASIN | 产品标题 | 价格 |\n`;
      content += `|---|------|---------|------|\n`;
      for (let j = 0; j < r.products.length; j++) {
        const p = r.products[j];
        const title = p.title.substring(0, 80).replace(/\|/g, '\\|');
        content += `| ${j + 1} | ${p.asin} | ${title} | ${p.price || '-'} |\n`;
      }
      content += '\n';
    }

    content += `---\n\n*报告生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}*\n`;

    fs.writeFileSync(reportPath, content, 'utf8');
    console.log(`  覆盖率报告已保存: ${reportPath}`);
  }

  // ─── 解析 ────────────────────────────────────────

  /**
   * 解析 Rufus 回复，提取结构化数据
   * @param {string} raw 原始回复文本
   * @param {string} question 原始问题
   * @returns {object}
   */
  _parse(raw, question) {
    const lines = raw.split('\n').map(l => l.trim()).filter(Boolean);

    // 提取 Rufus 追问建议
    const followUps = [];
    const followUpMarkers = ['Show ', 'Best ', 'How to ', 'What ', 'Can you ', 'How much ', 'Tips for ', 'Compare ', 'Which '];
    for (const line of lines) {
      if (followUpMarkers.some(m => line.startsWith(m)) && line.length > 10 && line.length < 150) {
        if (!followUps.includes(line)) {
          followUps.push(line.substring(0, 150));
        }
      }
    }

    // 提取提及的品牌（从配置中读取）
    let brands = [];
    if (this.brands.length > 0) {
      const brandPattern = new RegExp(this.brands.map(b => b.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'gi');
      const brandMatches = raw.match(brandPattern) || [];
      brands = [...new Set(brandMatches.map(b => b))];
    }

    // 提取价格区间（支持 $39.99、$15-80、$15–$80、$25 each）
    const priceMatch = raw.match(/\$\d+\.?\d*(?:\s*[\-–]\s*\$?\d+\.?\d*)?|\$\d+\.?\d*\s*(?:per \w+|each)/gi) || [];
    const prices = [...new Set(priceMatch.map(p => p.toLowerCase()))];

    return {
      question,
      raw,
      followUps: followUps.slice(0, 5),
      brands,
      prices,
      rawLength: raw.length,
    };
  }

  // ─── 保存本地 ────────────────────────────────────

  _saveLocally(qNum, question, raw, parsed) {
    const safeTopic = this.topic.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const filename = `Q${qNum}-${safeTopic}.md`;
    const filepath = path.join(this.saveDir, filename);

    let content = `# Rufus Q${qNum}: ${question}\n\n`;
    content += `**Customer question:** ${question}\n\n---\n\n`;
    content += `**Rufus 完整回复原文：**\n\n${raw}\n\n---\n\n`;
    content += `**Rufus 追问建议（Follow-ups）：**\n`;
    for (const fu of parsed.followUps) {
      content += `- ${fu}\n`;
    }
    if (parsed.brands.length > 0) {
      content += `\n**提及的品牌：** ${parsed.brands.join(', ')}\n`;
    }
    if (parsed.prices.length > 0) {
      content += `**价格区间：** ${parsed.prices.join(', ')}\n`;
    }

    fs.writeFileSync(filepath, content, 'utf8');
    console.log(`  已保存: ${filepath}`);
  }

  _saveSummary(questions, results) {
    const safeTopic = this.topic.replace(/[^a-zA-Z0-9.\-]/g, '_');
    const summaryPath = path.join(this.saveDir, `SUMMARY-${safeTopic}.md`);

    // 统计所有 follow-ups
    const allFollowUps = results.flatMap(r => r.followUps);
    const followUpCounts = {};
    for (const fu of allFollowUps) {
      const key = fu.substring(0, 60);
      followUpCounts[key] = (followUpCounts[key] || 0) + 1;
    }
    const topFollowUps = Object.entries(followUpCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 20)
      .map(([fu, count]) => ({ fu, count }));

    // 统计所有品牌
    const allBrands = results.flatMap(r => r.brands);
    const brandCounts = {};
    for (const b of allBrands) {
      brandCounts[b] = (brandCounts[b] || 0) + 1;
    }
    const topBrands = Object.entries(brandCounts)
      .sort((a, b) => b[1] - a[1])
      .slice(0, 10)
      .map(([brand, count]) => ({ brand, count }));

    let content = `# Rufus 调研汇总报告: ${this.topic}\n\n`;
    content += `**调研时间：** ${new Date().toISOString().split('T')[0]}\n`;
    content += `**问题数量：** ${questions.length}\n\n---\n\n`;

    content += `## 高频 Follow-up 追问（买家搜索词来源）\n\n`;
    for (const { fu, count } of topFollowUps) {
      content += `- ${fu} ${count > 1 ? `(${count}次)` : ''}\n`;
    }

    if (topBrands.length > 0) {
      content += `\n---\n\n## 竞品品牌提及统计\n\n`;
      for (const { brand, count } of topBrands) {
        content += `- ${brand}: ${count}次\n`;
      }
    }

    content += `\n---\n\n## 各问题 Rufus 回复概要\n\n`;
    for (let i = 0; i < results.length; i++) {
      const r = results[i];
      content += `### Q${i + 1}: ${r.question}\n\n`;
      content += `- 回复长度: ${r.rawLength} 字符\n`;
      content += `- 追问建议: ${r.followUps.length} 条\n`;
      if (r.brands.length > 0) {
        content += `- 提及品牌: ${r.brands.join(', ')}\n`;
      }
      if (r.prices.length > 0) {
        content += `- 价格区间: ${r.prices.join(', ')}\n`;
      }
      if (r.error) {
        content += `- **错误**: ${r.error}\n`;
      }
      content += '\n';
    }

    content += `---\n\n*报告生成于 ${new Date().toLocaleString('zh-CN', { timeZone: 'Asia/Shanghai' })}*\n`;

    fs.writeFileSync(summaryPath, content, 'utf8');
    console.log(`  汇总报告已保存: ${summaryPath}`);
  }
}

export default RufusResearchRunner;
