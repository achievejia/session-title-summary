// 纯函数 + 分类账全量验证（node test-pure.mjs）
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import {
  selectWindow, capText, titleFromOutput,
  mmdd, composeTitle, composeFallbackTitle, parseTitleFormat,
  isValidCategory, isValidTopic, mapCategory, fastPathCategory,
  containsCredential, containsPath, scrubCredentials, cleanForSend,
  parseModelJson, interpretModelResult, cleanShortTitle
} from './pure.js';
import { CategoryStore } from './store.js';

let failed = 0;
const check = (label, ok) => { console.log(ok ? 'PASS' : 'FAIL', label); if (!ok) failed += 1; };

// ===== 窗口选择（沿用）
let r = selectWindow([{ seq: 1, text: '你好' }, { seq: 2, text: '继续' }], 8192, 6, 12);
check('small keeps all', r.selected.length === 2 && r.omitted === 0);
const many = Array.from({ length: 60 }, (_, i) => ({ seq: i + 1, text: '消息'.repeat(60) + '#' + i }));
r = selectWindow(many, 2000, 6, 12);
check('windowed keeps first+last', r.selected[0].seq === 1 && r.selected.at(-1).seq === 60);
check('windowed fits', Buffer.byteLength(JSON.stringify(r.selected), 'utf8') <= 2000);
check('capText truncates', capText('长'.repeat(10000), 600).length <= 602);

// ===== MMDD（Asia/Shanghai）
check('mmdd Shanghai', mmdd(new Date('2026-10-04T04:00:00+08:00').getTime()) === '1004');
check('mmdd cross-zone', mmdd(Date.UTC(2026, 9, 3, 20, 0), 'Asia/Shanghai') === '1004');
check('mmdd UTC zone', mmdd(Date.UTC(2026, 9, 3, 20, 0), 'UTC') === '1003');

// ===== 标题格式
check('compose', composeTitle('1004', '发布', '部署服务器服务') === '1004 | 发布 | 部署服务器服务');
check('compose fallback', composeFallbackTitle('1004', '查询端午节日期') === '1004 | 查询端午节日期');
check('parse full', JSON.stringify(parseTitleFormat('1004 | 发布 | 部署服务器服务')) === JSON.stringify({ date: '1004', category: '发布', topic: '部署服务器服务' }));
check('parse two-part', parseTitleFormat('1004 | 查询端午节日期').category === null);
check('parse rejects plain', parseTitleFormat('部署服务器服务') === null);
check('parse rejects bad date', parseTitleFormat('13-04 | 发布 | x') === null);

// ===== 分类校验
check('valid categories', ['功能', '部署', 'Dev', 'API对接', '系统·运维'].every(isValidCategory));
check('rejects empty', !isValidCategory('') && !isValidCategory('   '));
check('rejects pipe', !isValidCategory('功能|设计'));
check('rejects newline', !isValidCategory('功\n能'));
check('rejects sentence', !isValidCategory('这是一个分类啊') && !isValidCategory('把服务部署到服务器'));
check('rejects long', !isValidCategory('特别特别特别特别特别特别特别长的分类'));
check('rejects credential', !isValidCategory('sk-abcdefgh12345678') && !isValidCategory('token=abc123xyz'));
check('rejects path', !isValidCategory('/Users/foo/bar') && !isValidCategory('C:\\Users\\x'));
check('topic valid/invalid', isValidTopic('部署服务器服务') && !isValidTopic('x') && !isValidTopic('a'.repeat(25)) && !isValidTopic('带|分隔') && !isValidTopic('密钥 token=abcd1234'));

// ===== 敏感信息
check('detect credential', containsCredential('api_key: sk-abcdefgh1234') && containsCredential('password: hunter2secret'));
check('detect path', containsPath('日志在 /Users/baronm/var/log 里') && containsPath('~/Documents/xx'));
check('scrub', !containsCredential(scrubCredentials('api_key: sk-abcdefgh1234 请帮忙')));
const cleaned = cleanForSend([
  { seq: 1, text: 'api_key: sk-abcdefgh1234' },
  { seq: 2, text: 'api_key: sk-abcdefgh1234' },
  { seq: 3, text: '看下这段：```js\n' + 'x'.repeat(400) + '\n``` 怎么改' }
]);
check('cleanForSend dedupe+scrub+code', cleaned.length === 2 && cleaned[0].text.includes('已脱敏') && cleaned[1].text.includes('「代码省略」'));

// ===== 分类映射
const map = { builtin: ['功能', '设计', '整改', '优化', '发布', '分析', '文档'], custom: ['系统', '开发', '部署'], synonyms: [['系统部署', '发布'], ['性能提升', '优化'], ['开发类', '开发']] };
check('map builtin exact', mapCategory('发布', map).category === '发布' && mapCategory('发布', map).matched);
check('map synonym exact', mapCategory('系统部署', map).category === '发布');
check('map synonym contains', mapCategory('服务器系统部署方案', map).category === '发布');
check('map custom exact', mapCategory('开发', map).category === '开发' && mapCategory('开发', map).matched);
check('map keeps unknown', mapCategory('安全', map).category === '安全' && !mapCategory('安全', map).matched);
check('fast path hit', fastPathCategory('帮我修复登录报错', [['修复', '整改']]) === '整改');
check('fast path miss', fastPathCategory('讲个笑话', [['修复', '整改']]) === null);

// ===== 模型输出解释
const good = { category: '发布', topic: '部署线上服务', confidence: 0.91, should_rename: true };
check('interpret full', JSON.stringify(interpretModelResult(good, {})) === JSON.stringify({ kind: 'full', category: '发布', topic: '部署线上服务' }));
check('interpret low confidence → fallback', interpretModelResult({ ...good, confidence: 0.4 }, { minConfidence: 0.6 }).kind === 'fallback');
check('interpret should_rename false → keep', interpretModelResult({ ...good, should_rename: false }, { hasAnchor: true }).kind === 'keep');
check('interpret bad category → fallback', interpretModelResult({ ...good, category: '这是一个分类啊' }, {}).kind === 'fallback');
check('interpret null → fallback', interpretModelResult(null, {}).kind === 'fallback');
check('parseModelJson plain', parseModelJson('{"category":"部署","topic":"配置线上服务","confidence":0.91}')?.category === '部署');
check('parseModelJson fenced', parseModelJson('```json\n{"category":"部署","topic":"x","confidence":0.9}\n```')?.category === '部署');
check('parseModelJson prose-wrapped', parseModelJson('结果如下：{"category":"部署","topic":"x"} 请查收')?.category === '部署');
check('parseModelJson garbage', parseModelJson('不是JSON') === null);

// ===== 简短标题清洗
check('clean strips emphasis', cleanShortTitle('**部署服务器**', 24) === '部署服务器');
check('clean strips old format', cleanShortTitle('1004 | 发布 | 部署服务器服务', 24) === '部署服务器服务');
check('clean clamps', cleanShortTitle('一二三四五六七八九十一二三四五六七八九十一二三四五六七八九', 24).length <= 24);
check('clean removes pipe', !cleanShortTitle('主题|带竖线', 24).includes('|'));
check('clean fallback default', cleanShortTitle('   ', 24) === '');

// ===== 分类账 CategoryStore
const dir = mkdtempSync(join(tmpdir(), 'sts-store-'));
const storePath = join(dir, 'categories.json');
const store = new CategoryStore(storePath, ['系统', '开发', '部署']);
check('store seeds custom', JSON.stringify(store.list()) === JSON.stringify(['系统', '开发', '部署']));
store.recordUse('部署');
store.recordUse('安全');
store.recordUse('开发', '开发类');
const raw = JSON.parse(readFileSync(storePath, 'utf8'));
const by = (n) => raw.custom.find((e) => e.name === n);
check('store persisted usage', by('部署').usage_count === 1 && by('安全').source === 'model' && by('安全').usage_count === 1);
check('store merged normalized_from', JSON.stringify(by('开发').normalized_from) === JSON.stringify(['开发类']));
const store2 = new CategoryStore(storePath, ['系统']);
check('store reloads from disk', store2.list().length === 4 && by === undefined ? false : store2.list().includes('安全'));
rmSync(dir, { recursive: true, force: true });

// ===== 回填跳过决策 + sleep
const { backfillSkipDecision, sleep } = await import('./backfill.js');
const hdr = (over = {}) => ({ id: 's1', createdAt: 1, ...over });
const policy = { includeUserTitles: false, includeSubagents: false };
check('backfill skips subagent', backfillSkipDecision(undefined, { header: hdr({ origin: 'subagent' }) }, policy).skip);
check('backfill keeps subagent when allowed', !backfillSkipDecision(undefined, { header: hdr({ origin: 'subagent' }) }, { ...policy, includeSubagents: true }).skip);
check('backfill renames nonconforming user-pinned', !backfillSkipDecision({ title: '我的名字', source: { kind: 'user' } }, { header: hdr() }, policy).skip);
check('backfill skips conforming user-pinned', backfillSkipDecision({ title: '1103 | 功能 | 新功能', source: { kind: 'user' } }, { header: hdr() }, policy).reason === 'valid-format');
check('backfill skips valid format', backfillSkipDecision({ title: '1004 | 发布 | 部署服务', source: { kind: 'provider' } }, { header: hdr() }, policy).reason === 'valid-format');
check('backfill skips valid two-part', backfillSkipDecision({ title: '1004 | 查询日期', source: { kind: 'fallback' } }, { header: hdr() }, policy).reason === 'valid-format');
check('backfill processes old title', !backfillSkipDecision({ title: '创建自动生成会话摘要标题插件', source: { kind: 'provider' } }, { header: hdr() }, policy).skip);
check('backfill processes no title', !backfillSkipDecision(undefined, { header: hdr() }, policy).skip);
{
  const t0 = Date.now();
  await sleep(50);
  const elapsed = Date.now() - t0;
  check('sleep elapsed', elapsed >= 40);
  const c = new AbortController();
  const p = sleep(5000, c.signal).then(() => 'resolved', () => 'aborted');
  c.abort();
  check('sleep aborts', (await p) === 'aborted');
}

// ===== package distribution contract: host supplies the DSH runtime
{
  const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'));
  const core = ['@deepseek-ai/dsh-session', '@deepseek-ai/dsh-session-title', '@deepseek-ai/dsh-session-title-llm', '@deepseek-ai/schemastery'];
  check('core packages are not hard dependencies', core.every((name) => !(name in (pkg.dependencies ?? {}))));
  check('core packages are optional peers', core.every((name) => pkg.peerDependencies?.[name] === '*' && pkg.peerDependenciesMeta?.[name]?.optional === true));
}

console.log(failed === 0 ? 'ALL PASS' : `${failed} FAILED`);
process.exit(failed === 0 ? 0 : 1);
