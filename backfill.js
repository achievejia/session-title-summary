import { SessionPreparation } from '@deepseek-ai/dsh-session';
import { foldSessionTitle } from '@deepseek-ai/dsh-session-title';
import { parseTitleFormat } from './pure.js';
import { safeDiagnostic, safeRecord } from './monitor.js';

export function sleep(ms, signal) {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(signal.reason ?? new Error('aborted'));
    const onAbort = () => { clearTimeout(timer); reject(signal.reason ?? new Error('aborted')); };
    const timer = setTimeout(() => { signal?.removeEventListener('abort', onAbort); resolve(); }, ms);
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}
export function backfillSkipDecision(folded, snapshot, options) {
  // Conforming titles are final. Every NONCONFORMING title is renamed
  // regardless of how it was set — manually renamed sessions included.
  if ((options.backfillIncludeSubagents ?? options.includeSubagents) !== true && snapshot.header.origin === 'subagent') return { skip: true, reason: 'subagent' };
  if (folded === undefined) return { skip: false, reason: '' };
  if (parseTitleFormat(folded.title) !== null) return { skip: true, reason: 'valid-format' };
  return { skip: false, reason: '' };
}
function notify(observer, method, value) {
  try { observer?.[method]?.(value); } catch { /* Diagnostics cannot fail a rename. */ }
}
/** Cold title refresh with live diagnostics; success is reported only AFTER append. */
export async function backfillHistoricalSessions(ctx, resolved, signal, observer) {
  const snapshots = (await ctx.sessionPersistence.list()).sort((a, b) => b.header.createdAt - a.header.createdAt);
  const liveById = new Map(ctx.sessions.list().map((session) => [session.id, session]));
  let selected = 0;
  const inventory = snapshots.map((snapshot) => {
    let excluded = '';
    if (liveById.has(snapshot.header.id)) excluded = 'live-session';
    else if (snapshot.header.origin === 'subagent' && !resolved.backfillIncludeSubagents) excluded = 'subagent';
    else if (snapshot.eventCount !== undefined && snapshot.eventCount < resolved.backfillMinEvents) excluded = 'events-below-minimum';
    else if (selected >= resolved.backfillMaxSessions) excluded = 'batch-limit';
    else selected++;
    return { snapshot, excluded };
  });
  const report = { discovered: snapshots.length, considered: selected, scanned: 0, renamed: 0, skipped: 0, failed: 0, titles: [], records: [] };
  notify(observer, 'onInventory', { discovered: report.discovered, considered: selected });
  for (const { snapshot, excluded } of inventory) {
    signal.throwIfAborted();
    const id = snapshot.header.id;
    const record = { sessionId: id, createdAt: snapshot.header.createdAt, oldTitle: '', newTitle: '', provider: null, model: null, modelLabel: '', method: 'none', status: 'scanning', reason: '', startedAt: Date.now(), finishedAt: null };
    let handle;
    const update = (patch) => {
      Object.assign(record, patch);
      notify(observer, 'onUpdate', safeRecord(record));
    };
    const finish = (status, extra = {}) => {
      Object.assign(record, { status, ...extra, finishedAt: Date.now() });
      report.scanned++;
      if (status === 'renamed') report.renamed++;
      else if (status === 'failed') report.failed++;
      else report.skipped++;
      const safe = safeRecord(record);
      report.records.push(safe);
      notify(observer, 'onProgress', { record: safe, report: { discovered: report.discovered, considered: report.considered, scanned: report.scanned, renamed: report.renamed, skipped: report.skipped, failed: report.failed } });
    };
    notify(observer, 'onStart', safeRecord(record));
    const liveSession = excluded === 'live-session' ? liveById.get(id) : undefined;
    if (liveSession) {
      // Open sessions are renamed through the LIVE refresh path: the owning
      // agent loop bridges the title appends, so no cold write handle is
      // needed and nonconforming titles must not be exempted.
      try {
        const current = foldSessionTitle(liveSession.snapshotEvents());
        update({ oldTitle: current?.title ?? '' });
        const decision = backfillSkipDecision(current, snapshot, resolved);
        if (decision.skip) { finish('skipped', { reason: decision.reason }); continue; }
        update({ status: 'generating' });
        const accepted = await ctx.sessionTitle.refresh(liveSession, signal);
        if (!accepted) finish('skipped', { reason: 'no-title-accepted' });
        else if (accepted.title === (current?.title ?? '')) finish('skipped', { reason: 'unchanged', newTitle: accepted.title });
        else {
          record.newTitle = accepted.title;
          if (report.titles.length < 20) report.titles.push(safeDiagnostic(accepted.title));
          finish('renamed');
        }
      } catch (error) {
        const message = safeDiagnostic(error?.message ?? error);
        finish('failed', { reason: signal.aborted ? 'cancelled' : message });
      } finally {
        try { await sleep(resolved.backfillDelayMs, signal); } catch { break; }
      }
      continue;
    }
    if (excluded) { finish('skipped', { reason: excluded }); continue; }
    try {
      // A session opened mid-scan loses the write race and is reported as
      // session-in-use by the open() ownership check below — no exemption.
      handle = await ctx.sessionPersistence.open(id, 'write', { signal });
      const cold = await handle.read(0, undefined, { signal });
      const current = foldSessionTitle(cold.events);
      update({ oldTitle: current?.title ?? '' });
      if (cold.events.length < resolved.backfillMinEvents) { finish('skipped', { reason: 'events-below-minimum' }); continue; }
      const decision = backfillSkipDecision(current, snapshot, resolved);
      if (decision.skip) { finish('skipped', { reason: decision.reason }); continue; }
      const initial = cold.events.length;
      const preparation = SessionPreparation.create(ctx.sessions.prepare(id, { seed: [...cold.events], meta: structuredClone(handle.header), inheritedEventCount: handle.inheritedEventCount, eventState: cold.eventState }));
      let leave;
      let storedCursor = initial;
      const flushSuffix = async () => {
        // Flush the constructor's non-published seed marker BEFORE entering.
        // Use the immutable full snapshot and explicit sequence cursor, so the
        // append cannot omit the first lifecycle event or repeat it later.
        const persistedNow = await handle.read(0, undefined, { signal });
        const storedEvents = persistedNow.events;
        const nextSeq = storedEvents.length ? storedEvents.at(-1).seq + 1 : 0;
        const localEvents = preparation.session.snapshotEvents();
        // Another mounted persistence observer can already have stored live
        // events. Verify the overlap instead of appending the same seq twice.
        for (let seq = storedCursor; seq < nextSeq; seq++) {
          const diskEvent = storedEvents.find((e) => e.seq === seq);
          const localEvent = localEvents.find((e) => e.seq === seq);
          if (!diskEvent || !localEvent || JSON.stringify(diskEvent) !== JSON.stringify(localEvent)) throw new Error(`backfill persisted-prefix conflict at seq ${seq}`);
        }
        storedCursor = nextSeq;
        const suffix = localEvents.filter((event) => event.seq >= storedCursor);
        if (suffix.length) {
          if (suffix[0].seq !== storedCursor) throw new Error(`backfill event gap: expected ${storedCursor}, got ${suffix[0].seq}`);
          await handle.append([...suffix]);
          storedCursor = suffix.at(-1).seq + 1;
        }
      };
      try {
        await flushSuffix();
        leave = ctx.sessions.enter(preparation.session);
        update({ status: 'generating' });
        let accepted;
        try { accepted = await ctx.sessionTitle.refresh(preparation.session, signal); }
        finally {
          // The provider reports the actual effective LLM route when it dispatches.
          // Copy that metadata back, never label a historical route as a call.
          const actual = observer?.getExecution?.(id);
          if (actual) Object.assign(record, actual);
          update({ status: 'persisting' });
          await flushSuffix();
          await handle.flush?.();
        }
        if (!accepted) finish('skipped', { reason: 'no-title-accepted' });
        else if (accepted.title === (current?.title ?? '')) finish('skipped', { reason: 'unchanged', newTitle: accepted.title });
        else {
          record.newTitle = accepted.title;
          if (report.titles.length < 20) report.titles.push(safeDiagnostic(accepted.title));
          finish('renamed');
        }
      } finally { leave?.(); preparation[Symbol.dispose](); }
    } catch (error) {
      const message = safeDiagnostic(error?.message ?? error);
      if (/already|owned|in use/i.test(message)) finish('skipped', { reason: 'session-in-use' });
      else finish('failed', { reason: signal.aborted ? 'cancelled' : message });
    } finally {
      try { await handle?.close(); } catch { /* Append determined the result already. */ }
      try { await sleep(resolved.backfillDelayMs, signal); } catch { break; }
    }
  }
  return report;
}
