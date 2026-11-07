// Bounded diagnostic cache, not a source of session titles. Only redacted
// metadata is persisted; conversation bodies and model responses never enter it.
import { mkdirSync, readFileSync, writeFileSync, renameSync } from 'node:fs';
import { dirname } from 'node:path';
import { randomUUID } from 'node:crypto';
import { scrubCredentials } from './pure.js';

export function safeDiagnostic(value) {
  return scrubCredentials(String(value ?? '')).replace(/(?:\/(?:Users|home|var|etc|opt|tmp|private|Applications|Library)\/\S+|~\/\S+|[A-Za-z]:\\\\\S+)/g, '[路径已隐藏]').slice(0, 300);
}
export function safeRecord(record) {
  const result = { ...record };
  for (const key of ['oldTitle', 'newTitle', 'reason', 'provider', 'model']) {
    if (result[key] != null) result[key] = safeDiagnostic(result[key]);
  }
  result.modelLabel = result.model ? `${result.provider ? result.provider + '/' : ''}${result.model}` : '';
  return result;
}
export class RunMonitor {
  constructor(filePath) {
    this.filePath = filePath;
    this.state = { running: false, current: null, lastReport: null, lastRunAt: null, history: [], error: null };
    try {
      const saved = JSON.parse(readFileSync(filePath, 'utf8'));
      if (saved.version === 1 && Array.isArray(saved.history)) this.state = { ...this.state, ...saved };
      if (this.state.running) {
        this.state.running = false;
        this.state.current = null;
        if (this.state.lastReport) {
          this.state.lastReport.state = 'interrupted';
          this.state.history = [this.state.lastReport, ...this.state.history].slice(0, 10);
        }
        this.save();
      }
    } catch { /* Missing cache starts empty. */ }
  }
  snapshot() { return structuredClone(this.state); }
  save() {
    try {
      mkdirSync(dirname(this.filePath), { recursive: true });
      const tmp = `${this.filePath}.${randomUUID()}.tmp`;
      writeFileSync(tmp, JSON.stringify({ version: 1, ...this.state }) + '\n', { mode: 0o600 });
      renameSync(tmp, this.filePath);
    } catch (error) { this.state.error = safeDiagnostic(`记录持久化失败: ${error.message}`); }
  }
  start(reason) {
    this.state.running = true;
    this.state.current = null;
    this.state.error = null;
    this.state.lastReport = { runId: randomUUID(), source: reason, state: 'running', startedAt: Date.now(), discovered: 0, considered: 0, scanned: 0, renamed: 0, skipped: 0, failed: 0, records: [], titles: [] };
    this.save();
  }
  inventory(summary) { Object.assign(this.state.lastReport, summary); this.save(); }
  update(record) { this.state.current = safeRecord(record); this.save(); }
  progress({ record, report }) {
    this.state.current = null;
    Object.assign(this.state.lastReport, report);
    this.state.lastReport.records.push(safeRecord(record));
    this.state.lastReport.records = this.state.lastReport.records.slice(-1000);
    this.save();
  }
  finish(report, error) {
    const final = { ...this.state.lastReport, ...report, state: error ? (error.message === 'plugin-unloaded' ? 'interrupted' : 'failed') : 'completed', finishedAt: Date.now() };
    final.records = (final.records ?? []).slice(-1000).map(safeRecord);
    final.titles = (final.titles ?? []).map(safeDiagnostic);
    this.state.running = false;
    this.state.current = null;
    this.state.lastRunAt = final.finishedAt;
    this.state.lastReport = final;
    if (error) this.state.error = safeDiagnostic(error.message ?? error);
    this.state.history = [final, ...this.state.history].slice(0, 10);
    this.save();
  }
}
