// Dynamic category store: builtin + audited custom categories persisted as
// plain JSON (community-plugin convention, cf. ~/.dsh/dsh-ssh.json), with
// atomic writes and per-process memoization.
import { mkdirSync, readFileSync, renameSync, writeFileSync, existsSync } from "node:fs";
import { dirname, join } from "node:path";
import { homedir } from "node:os";

/** Default store location under the DSH home. */
export const defaultStorePath = () => join(homedir(), ".dsh", "session-title-summary", "categories.json");

/**
 * One durable category ledger.
 * Shape: { version: 1, custom: [{ name, source, first_seen_at, usage_count, normalized_from }] }.
 */
export class CategoryStore {
	constructor(filePath, seedCustom = []) {
		this.filePath = filePath;
		this.seedCustom = [...seedCustom];
		this.data = this.load();
	}

	/** Read the file once; corrupt or missing files re-seed. */
	load() {
		try {
			const raw = JSON.parse(readFileSync(this.filePath, "utf8"));
			const custom = Array.isArray(raw.custom)
				? raw.custom.filter((e) => typeof e?.name === "string" && e.name.length > 0)
				: [];
			return { version: 1, custom };
		} catch {
			const custom = this.seedCustom.map((name) => ({
				name,
				source: "builtin-seed",
				first_seen_at: new Date().toISOString(),
				usage_count: 0,
				normalized_from: []
			}));
			return { version: 1, custom };
		}
	}

	/** Names of all known custom categories. */
	list() {
		return this.data.custom.map((entry) => entry.name);
	}

	/** Record one use: bump usage_count, merge normalized variants, first-seen stamp. */
	recordUse(name, normalizedFrom = null) {
		const clean = typeof name === "string" ? name.trim() : "";
		if (clean.length === 0) return;
		const now = new Date().toISOString();
		const entry = this.data.custom.find((e) => e.name === clean);
		if (entry === undefined) {
			this.data.custom.push({
				name: clean,
				source: "model",
				first_seen_at: now,
				usage_count: 1,
				normalized_from: normalizedFrom ? [normalizedFrom] : []
			});
		} else {
			entry.usage_count = (Number.isInteger(entry.usage_count) ? entry.usage_count : 0) + 1;
			if (normalizedFrom !== null && !entry.normalized_from.includes(normalizedFrom)) {
				entry.normalized_from = [...entry.normalized_from, normalizedFrom];
			}
		}
		this.save();
	}

	/** Atomic write: temp file in the same directory, then rename. */
	save() {
		mkdirSync(dirname(this.filePath), { recursive: true });
		const temp = join(dirname(this.filePath), `.${Math.random().toString(36).slice(2)}.tmp`);
		writeFileSync(temp, JSON.stringify(this.data, null, "\t") + "\n", "utf8");
		renameSync(temp, this.filePath);
	}

	/** Whether the backing file exists yet (used by tests and diagnostics). */
	exists() {
		return existsSync(this.filePath);
	}
}
