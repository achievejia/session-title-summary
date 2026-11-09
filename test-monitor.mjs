import test from 'node:test';
import assert from 'node:assert/strict';
import { mkdtempSync, rmSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { backfillHistoricalSessions } from './backfill.js';
import { RunMonitor } from './monitor.js';
import { registerPanelApi } from './panel-api.js';
import { apply, Config, inject } from './index.js';
import { Session } from '@deepseek-ai/dsh-session';

const config = { backfillMaxSessions: 50, backfillMinEvents: 1, backfillDelayMs: 1 };
function fixture({ same = false, writeFails = false } = {}) {
  const events = [{ type: 'session/title', seq: 0, time: 1, data: { title: '旧标题', messageSeqs: [], source: { kind: 'fallback' } } }];
  const persisted = [...events];
  const session = { id: 's1', header: { id: 's1', createdAt: 1 }, snapshotEvents: (n = 0) => events.slice(n), requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) };
  const ctx = {
    sessions: { list: () => [], prepare: () => session, enter: () => () => {} },
    sessionPersistence: {
      list: async () => [{ header: session.header, eventCount: 1 }],
      open: async () => ({ header: session.header, inheritedEventCount: 0, read: async () => ({ events: [...persisted], eventState: 'detached' }), append: async (batch) => { if (writeFails) throw Error('disk-full'); persisted.push(...batch); }, close: async () => {} })
    },
    sessionTitle: { refresh: async () => { const title = same ? '旧标题' : '1103 | 分析 | 新主题'; events.push({ type: 'session/title', seq: 1, time: 2, data: { title, source: { kind: 'provider' } } }); return { title }; } }
  };
  return ctx;
}
test('reports live old title before refresh and counts unchanged as skipped', async () => {
  const updates = [];
  const report = await backfillHistoricalSessions(fixture({ same: true }), config, new AbortController().signal, { onUpdate: (r) => updates.push(r) });
  assert.ok(updates.some((r) => r.oldTitle === '旧标题' && !r.finishedAt));
  assert.equal(report.renamed, 0);
  assert.equal(report.records[0].reason, 'unchanged');
});
test('write failure never reports a rename', async () => {
  const report = await backfillHistoricalSessions(fixture({ writeFails: true }), config, new AbortController().signal);
  assert.equal(report.renamed, 0);
  assert.equal(report.failed, 1);
  assert.match(report.records[0].reason, /disk-full/);
});
test('all discovered sessions are accounted for including live and batch-limited', async () => {
  const ctx = fixture();
  ctx.sessions.list = () => [{ id: 'live', snapshotEvents: () => [{ type: 'session/title', seq: 0, time: 1, data: { title: '1103 | 功能 | 打开中的会话', messageSeqs: [], source: { kind: 'user' } } }] }];
  ctx.sessionPersistence.list = async () => ['live', 's1', 's2'].map((id) => ({ header: { id, createdAt: 1 }, eventCount: 1 }));
  const report = await backfillHistoricalSessions(ctx, { ...config, backfillMaxSessions: 1 }, new AbortController().signal);
  assert.equal(report.discovered, 3);
  assert.equal(report.records.length, 3);
  assert.ok(report.records.some((r) => r.reason === 'valid-format' && r.sessionId === 'live'));
  assert.ok(report.records.some((r) => r.reason === 'batch-limit'));
});
test('monitor survives restart, redacts secrets and marks interrupted jobs', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-monitor-'));
  try {
    const path = join(dir, 'runs.json');
    const m = new RunMonitor(path);
    m.start('panel');
    m.update({ sessionId: 's', status: 'calling-model', oldTitle: 'token=top-secret-credential /Users/private/project', model: 'm', provider: 'p' });
    const raw = readFileSync(path, 'utf8');
    assert.ok(!raw.includes('top-secret-credential'));
    assert.ok(!raw.includes('/Users/private/project'));
    const restored = new RunMonitor(path).snapshot();
    assert.equal(restored.running, false);
    assert.equal(restored.lastReport.state, 'interrupted');
  } finally { rmSync(dir, { recursive: true, force: true }); }
});
test('monitor stores effective model only when a call begins', () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-model-'));
  try {
    const m = new RunMonitor(join(dir, 'runs.json'));
    m.start('panel');
    m.update({ sessionId: 's', status: 'calling-model', provider: 'fixed', model: 'actual' });
    assert.equal(m.snapshot().current.modelLabel, 'fixed/actual');
    m.finish({ considered: 1, scanned: 1, renamed: 0, skipped: 1, failed: 0, records: [] });
    assert.equal(new RunMonitor(m.filePath).snapshot().running, false);
    assert.equal(m.snapshot().history.length, 1);
  } finally { rmSync(dir, { recursive: true, force: true }); }
});

test('panel routes register on shared authenticated connection, not HTTP-only server', async () => {
  const routes = [];
  const ctx = { effect: (f) => f(), connection: { fetch: { register: (r) => { routes.push(r); return async () => {}; } } } };
  let running = false;
  registerPanelApi(ctx, () => ({ running, version: '1.4.0' }), () => { if (running) return false; running = true; return true; });
  const get = () => routes[0].fetch(new Request('http://localhost/api/session-title-summary/status'));
  assert.equal((await (await get()).json()).version, '1.4.0');
  const request = () => new Request('http://localhost/api/session-title-summary/backfill', { method: 'POST', headers: { 'content-type': 'application/json' } });
  assert.equal((await routes[1].fetch(request())).status, 202);
  assert.equal((await (await routes[1].fetch(request())).json()).started, false);
  assert.equal((await (await get()).json()).running, true);
  assert.ok(inject.includes('connection'));
  assert.ok(inject.includes('sessionPersistence'));
});
test('plugin run remains running until scan settles and only one scan is admitted', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-lifecycle-'));
  const routes = []; const disposers = [];
  let release;
  const pending = new Promise((r) => { release = r; });
  try {
    const ctx = {
      on: () => () => {}, effect: (f) => { const d = f(); if (d) disposers.push(d); return d; },
      sessionTitle: { register: () => () => {} }, sessions: { list: () => [] },
      sessionPersistence: { list: async () => { await pending; return []; } },
      connection: { fetch: { register: (r) => { routes.push(r); return async () => {}; } } }
    };
    apply(ctx, Config({ backfill: false, storePath: join(dir, 'categories.json') }));
    const status = async () => (await routes[0].fetch(new Request('http://localhost/status'))).json();
    const post = () => routes[1].fetch(new Request('http://localhost/backfill', { method: 'POST', headers: { 'content-type': 'application/json' } }));
    assert.equal((await (await post()).json()).started, true);
    assert.equal((await status()).running, true);
    assert.equal((await (await post()).json()).started, false);
    release(); await pending; await new Promise(setImmediate);
    assert.equal((await status()).running, false);
    assert.equal((await status()).history[0].state, 'completed');
  } finally { release?.(); for (const d of disposers.reverse()) await d(); rmSync(dir, { recursive: true, force: true }); }
});

test('real restored Session persists constructor marker before provider events contiguously', async () => {
  const persisted = [{ type: 'session/title', seq: 0, time: 1, data: { title: '旧标题', messageSeqs: [], source: { kind: 'fallback' } } }];
  const header = { id: 's1', version: 4, createdAt: 1, isSeeded: false };
  const batches = [];
  const ctx = {
    sessions: {
      list: () => [], prepare: (id, o) => Session.fromRestore(id, o.seed, o.meta, 0, o.eventState),
      enter: () => () => {}
    },
    sessionPersistence: {
      list: async () => [{ header, eventCount: 1 }],
      open: async () => ({ header, inheritedEventCount: 0,
        read: async () => ({ events: [...persisted], eventState: 'shared-frozen' }),
        append: async (events) => {
          assert.equal(events[0].seq, persisted.length);
          events.forEach((e) => { assert.equal(e.seq, persisted.length); persisted.push(e); });
          batches.push(events.map((e) => e.type));
        }, flush: async () => {}, close: async () => {}
      })
    },
    sessionTitle: { refresh: async (session) => {
      assert.equal(persisted.at(-1).type, 'session/end-seed');
      session.append('session/title', { title: '1103 | 分析 | 新主题', messageSeqs: [], source: { kind: 'fallback' } });
      return { title: '1103 | 分析 | 新主题' };
    } }
  };
  const report = await backfillHistoricalSessions(ctx, config, new AbortController().signal);
  assert.equal(report.failed, 0, JSON.stringify(report.records));
  assert.equal(report.renamed, 1);
  assert.deepEqual(batches, [['session/end-seed'], ['session/title']]);
});

test('config route validates pairs, persists and clears the fixed title model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-config-'));
  const routes = []; const disposers = [];
  try {
    const ctx = {
      on: () => () => {}, effect: (f) => { const d = f(); if (d) disposers.push(d); return d; },
      sessionTitle: { register: () => () => {} }, sessions: { list: () => [] },
      sessionPersistence: { list: async () => [] },
      connection: { fetch: { register: (r) => { routes.push(r); return async () => {}; } } }
    };
    apply(ctx, Config({ backfill: false, storePath: join(dir, 'categories.json') }));
    const config = routes.find((r) => r.path.endsWith('/config'));
    const status = () => routes[0].fetch(new Request('http://localhost/status')).then((x) => x.json());
    const post = (body) => config.fetch(new Request('http://localhost/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) }));
    assert.equal((await post({ provider: 'p', model: '' })).status, 400);
    assert.equal((await post({ provider: 'deepseek', model: 'deepseek-chat' })).status, 200);
    assert.deepEqual((await status()).routeOverride, { provider: 'deepseek', model: 'deepseek-chat' });
    const saved = JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8'));
    assert.equal(saved.model, 'deepseek-chat');
    assert.equal((await post({ provider: '', model: '' })).status, 200);
    assert.equal((await status()).routeOverride, null);
    // Restart path: a fresh apply() reads the persisted settings.json.
    assert.equal(JSON.parse(readFileSync(join(dir, 'settings.json'), 'utf8')).provider, undefined);
  } finally { for (const d of disposers.reverse()) await d(); rmSync(dir, { recursive: true, force: true }); }
});
test('without override a routeless session falls back; with override it attempts the fixed model', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-override-'));
  const routes = []; const disposers = []; let registered;
  const ctx = {
    on: () => () => {}, effect: (f) => { const d = f(); if (d) disposers.push(d); return d; },
    sessionTitle: { register: (p) => { registered = p; return () => {}; } }, sessions: { list: () => [] },
    sessionPersistence: { list: async () => [] }, llm: { prepareCall: async () => { throw new Error('stub-llm-reached'); } },
    connection: { fetch: { register: (r) => { routes.push(r); return async () => {}; } } }
  };
  try {
    apply(ctx, Config({ backfill: false, localFastPath: false, storePath: join(dir, 'categories.json') }));
    const generate = () => registered.generate({
      session: { header: { createdAt: new Date('2026-10-04T04:00:00+08:00').getTime() }, id: 's' },
      messages: [{ seq: 1, text: '查询端午节日期' }], signal: new AbortController().signal
    });
    const fallback = await generate();
    assert.match(fallback.title, /^1004 \| /);
    const config = routes.find((r) => r.path.endsWith('/config'));
    await config.fetch(new Request('http://localhost/config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ provider: 'deepseek', model: 'deepseek-chat' }) }));
    await assert.rejects(generate(), /stub-llm-reached/);
  } finally { for (const d of disposers.reverse()) await d(); rmSync(dir, { recursive: true, force: true }); }
});

test('models route serves the live provider catalog with isolated failures', async () => {
  const dir = mkdtempSync(join(tmpdir(), 'sts-models-'));
  const routes = []; const disposers = [];
  try {
    const ctx = {
      on: () => () => {}, effect: (f) => { const d = f(); if (d) disposers.push(d); return d; },
      sessionTitle: { register: () => () => {} }, sessions: { list: () => [] },
      sessionPersistence: { list: async () => [] },
      llm: {
        listProviders: () => [{ id: 'deepseek-account', name: 'DeepSeek Account' }, { id: 'broken', name: 'Broken' }],
        listModels: async (id) => {
          if (id === 'broken') throw new Error('upstream down');
          return [{ id: 'deepseek-chat', name: 'DeepSeek Chat' }, { id: 'deepseek-reasoner', name: 'DeepSeek Reasoner' }];
        }
      },
      connection: { fetch: { register: (r) => { routes.push(r); return async () => {}; } } }
    };
    apply(ctx, Config({ backfill: false, storePath: join(dir, 'categories.json') }));
    const models = routes.find((r) => r.path.endsWith('/models'));
    const response = await models.fetch(new Request('http://localhost/models'));
    const body = await response.json();
    assert.equal(response.status, 200);
    const deepseek = body.groups.find((g) => g.id === 'deepseek-account');
    assert.deepEqual(deepseek.models.map((m) => m.id), ['deepseek-chat', 'deepseek-reasoner']);
    const broken = body.groups.find((g) => g.id === 'broken');
    assert.deepEqual(broken.models, []);
    assert.match(broken.error, /upstream down/);
  } finally { for (const d of disposers.reverse()) await d(); rmSync(dir, { recursive: true, force: true }); }
});

test('open live sessions are renamed through the live refresh path, not skipped', async () => {
  const events = [{ type: 'session/title', seq: 0, time: 1, data: { title: '批量创建电签注册文件夹', messageSeqs: [], source: { kind: 'provider' } } }];
  const live = {
    id: 's1', header: { id: 's1', createdAt: 1 },
    snapshotEvents: () => [...events],
    requestHeader: () => ({ config: { provider: 'p', model: 'm' } })
  };
  let opened = 0;
  const ctx = {
    sessions: { list: () => [live], prepare: () => { throw new Error('cold path must not run'); }, enter: () => () => {} },
    sessionPersistence: {
      list: async () => [{ header: live.header, eventCount: 1 }],
      open: async () => { opened++; throw new Error('must not cold-open a live session'); }
    },
    sessionTitle: { refresh: async (session) => {
      assert.equal(session, live);
      events.push({ type: 'session/title', seq: 1, time: 2, data: { title: '1021 | 功能 | 批量创建电签注册文件夹', source: { kind: 'provider' } } });
      return { title: '1021 | 功能 | 批量创建电签注册文件夹' };
    } }
  };
  const report = await backfillHistoricalSessions(ctx, config, new AbortController().signal);
  assert.equal(opened, 0);
  assert.equal(report.renamed, 1);
  assert.equal(report.records[0].newTitle, '1021 | 功能 | 批量创建电签注册文件夹');
});
test('open live sessions with conforming titles are still skipped', async () => {
  const events = [{ type: 'session/title', seq: 0, time: 1, data: { title: '1021 | 功能 | 已合规标题', messageSeqs: [], source: { kind: 'user' } } }];
  const live = { id: 's1', header: { id: 's1', createdAt: 1 }, snapshotEvents: () => [...events] };
  const ctx = {
    sessions: { list: () => [live] },
    sessionPersistence: { list: async () => [{ header: live.header, eventCount: 1 }], open: async () => { throw new Error('no cold open'); } },
    sessionTitle: { refresh: async () => { throw new Error('must not refresh conforming'); } }
  };
  const report = await backfillHistoricalSessions(ctx, config, new AbortController().signal);
  assert.equal(report.skipped, 1);
  assert.equal(report.records[0].reason, 'valid-format');
});

test('skipped sessions do not consume the batch quota (no starvation)', async () => {
  // 60 conforming (skipped) + 1 old nonconforming: the old one must still be processed.
  const persisted = [];
  for (let i = 0; i < 60; i++) persisted.push({ type: 'session/title', seq: 0, time: 1, data: { title: `1103 | 功能 | 合规${i}`, messageSeqs: [], source: { kind: 'provider' } } });
  const stores = persisted.map((event, i) => ({ events: [event], header: { id: `ok${i}`, createdAt: 100 + i, origin: undefined } }));
  const targetEvents = [{ type: 'session/title', seq: 0, time: 1, data: { title: '旧的不合规标题', messageSeqs: [], source: { kind: 'provider' } } }];
  stores.push({ events: targetEvents, header: { id: 'old', createdAt: 1, origin: undefined } });
  const open = async (id) => {
    const store = stores.find((s) => s.header.id === id);
    return { header: store.header, inheritedEventCount: 0,
      read: async () => ({ events: [...store.events], eventState: 'detached' }),
      append: async (batch) => { store.events.push(...batch); },
      close: async () => {} };
  };
  const session = { id: 'old', header: { id: 'old', createdAt: 1 }, snapshotEvents: () => targetEvents, requestHeader: () => ({ config: { provider: 'p', model: 'm' } }) };
  const ctx = {
    sessions: { list: () => [], prepare: (id) => session, enter: () => () => {} },
    sessionPersistence: { list: async () => stores.map((s) => ({ header: s.header, eventCount: s.events.length })), open },
    sessionTitle: { refresh: async () => { targetEvents.push({ type: 'session/title', seq: 1, time: 2, data: { title: '1103 | 分析 | 已处理', source: { kind: 'provider' } } }); return { title: '1103 | 分析 | 已处理' }; } }
  };
  const report = await backfillHistoricalSessions(ctx, config, new AbortController().signal);
  const target = report.records.find((r) => r.sessionId === 'old');
  assert.equal(target.reason !== 'batch-limit' && target.status === 'renamed', true, `old session starved: ${JSON.stringify(target)}`);
  assert.equal(report.renamed, 1);
  const batchLimited = report.records.filter((r) => r.reason === 'batch-limit');
  assert.equal(batchLimited.length, 0);
});

test('sessions missing session/created are skipped as malformed, not failed', async () => {
  const events = [{ type: 'session/title', seq: 0, time: 1, data: { title: '导入会话', messageSeqs: [], source: { kind: 'provider' } } }];
  const store = { events: [...events], header: { id: 'imp1', createdAt: 1 } };
  const ctx = {
    sessions: { list: () => [], prepare: (id, o) => { throw Object.assign(new Error('session "import-imp1" cannot append before session/created completes'), { code: 'ERR_SESSION_STATE' }); }, enter: () => () => {} },
    sessionPersistence: { list: async () => [{ header: store.header, eventCount: 1 }], open: async () => ({ header: store.header, inheritedEventCount: 0, read: async () => ({ events: [...store.events], eventState: 'detached' }), append: async () => {}, close: async () => {} }) },
    sessionTitle: { refresh: async () => ({ title: 'x' }) }
  };
  const report = await backfillHistoricalSessions(ctx, config, new AbortController().signal);
  assert.equal(report.failed, 0);
  assert.equal(report.records[0].status, 'skipped');
  assert.equal(report.records[0].reason, 'malformed-session');
});
