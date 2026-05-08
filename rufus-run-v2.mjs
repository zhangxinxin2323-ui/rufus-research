/**
 * Rufus Research - 示例运行脚本
 * 使用 puppeteer 自动化与 Amazon Rufus AI 进行咖啡机品类调研
 *
 * 运行方式:
 *   cd ~/.claude/skills/rufus-research
 *   node rufus-run-v2.mjs
 */

import { RufusResearchRunner } from './scripts/rufus-research-runner.mjs';

const questions = [
  'Someone already owns the CERA+ portable espresso machine — what would make OutIn Nano the better choice for them?',
  'For a camper who needs coffee before a 5am hike, which matters more: heating speed or number of hot shots available?',
  'If someone mostly drinks espresso at their office desk but occasionally goes camping, is OutIn Nano over-engineered compared to a simple capsule machine?',
  'Between self-heating and having a larger battery that can brew more cups, which is the more valued feature for travel espresso users?',
  'Is the 670-gram weight difference between OutIn Nano and CERA+ actually noticeable during a full-day hike, or does it only matter for carry-on luggage?',
  'When buying a portable espresso machine for international travel, how do airline carry-on regulations influence which brand someone chooses?',
  'For a road-trip couple sharing one machine, what is the minimum number of consecutive hot shots before they need to recharge — and which brands meet that threshold?',
  'How important is the NS capsule compatibility compared to ground-coffee-only mode for someone who switches between home and travel?',
  'In what specific car or van life situation would someone choose OutIn Nano over just bringing a manual hand pump espresso maker?',
  'A digital nomad who works from a different city each week — is OutIn Nano\'s self-heating feature actually faster or more convenient than finding a power outlet and using a portable kettle?',
];

const runner = new RufusResearchRunner({
  topic: 'portable-espresso-machine',
  saveDir: '~/workspace/rufus-coffee-research-v2',
  brands: ['OutIn', 'CERA+', 'Wacaco', 'Staresso', 'HiBREW'],
  amazonUrl: 'https://www.amazon.com/s?k=portable+espresso+machine&s=review-rank',
});

try {
  const results = await runner.run(questions);

  console.log('\n\n========== 调研结果预览 ==========');
  for (let i = 0; i < results.length; i++) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`Q${i + 1}: ${questions[i]}`);
    console.log(`${'='.repeat(80)}`);
    console.log(`回复长度: ${results[i].rawLength} 字符`);
    console.log(`Follow-ups: ${results[i].followUps.length} 条`);
    console.log(`品牌提及: ${results[i].brands.join(', ') || '无'}`);
  }
} catch (err) {
  console.error('调研失败:', err.message);
  process.exit(1);
}
