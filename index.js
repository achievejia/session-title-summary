import z from "@deepseek-ai/schemastery";
import { SessionTitleProviderId, normalizeSessionTitle } from "@deepseek-ai/dsh-session-title";
import { SessionTitleLlmConfigFields, executeSessionTitleLlm, resolveSessionTitleLlmConfig } from "@deepseek-ai/dsh-session-title-llm";
import {
	selectWindow, mmdd, composeTitle, composeFallbackTitle, parseTitleFormat, mapCategory,
	fastPathCategory, cleanForSend, parseModelJson, interpretModelResult, cleanShortTitle
} from "./pure.js";
import { CategoryStore, defaultStorePath } from "./store.js";
import { backfillHistoricalSessions, sleep } from "./backfill.js";
import { RunMonitor } from "./monitor.js";
import { registerPanelApi } from "./panel-api.js";
import { join, dirname } from "node:path";
import { readFileSync, writeFileSync, mkdirSync, renameSync } from "node:fs";
import { randomUUID } from "node:crypto";

/** Summary-title provider for `ctx.sessionTitle` with categorized `MMDD | 分类 | 主题` titles. */
const name = "session-title-summary";

const inject = [
	"sessionTitle",
	"llm",
	"sessions",
	"sessionPersistence",
	"connection"
];

/** Default synonym table: model wording → canonical category (spec examples plus safe extensions). */
const DEFAULT_SYNONYMS = [
	["系统部署", "发布"],
	["部署工作", "发布"],
	["上线", "发布"],
	["代码开发", "功能"],
	["问题修复", "整改"],
	["bug修复", "整改"],
	["bug 修复", "整改"],
	["修bug", "整改"],
	["性能提升", "优化"],
	["性能优化", "优化"],
	["方案调研", "分析"],
	["页面设计", "设计"],
	["接口说明整理", "文档"],
	["开发类", "开发"],
	["开发工作", "开发"]
];

/** Default local fast-path keywords: unambiguous verbs → builtin categories. */
const DEFAULT_FAST_PATH = [
	["部署", "发布"],
	["上线", "发布"],
	["发布", "发布"],
	["修复", "整改"],
	["fix", "整改"],
	["bug", "整改"],
	["报错", "整改"],
	["崩溃", "整改"],
	["优化", "优化"],
	["重构", "优化"],
	["提速", "优化"],
	["设计", "设计"],
	["UI", "设计"],
	["界面", "设计"],
	["原型", "设计"],
	["文档", "文档"],
	["README", "文档"],
	["注释", "文档"],
	["调研", "分析"],
	["选型", "分析"],
	["评估", "分析"],
	["对比", "分析"]
];

const pairList = () => z.array(z.tuple([z.string(), z.string()]));
const positiveInt = () => z.number().step(1).min(1);

/** Loader schema: category policy, pipeline gates, and shared execution controls. */
const Config = z.object({
	cadence: z.union([z.const("first-prompt"), z.const("all-prompts")]).default("all-prompts"),
	datePrefix: z.boolean().default(true),
	timeZone: z.string().default("Asia/Shanghai"),
	builtinCategories: z.array(z.string()).default(["功能", "设计", "整改", "优化", "发布", "分析", "文档"]),
	customCategories: z.array(z.string()).default(["系统", "开发", "部署"]),
	synonyms: pairList().default(DEFAULT_SYNONYMS),
	localFastPath: z.boolean().default(true),
	fastPathKeywords: pairList().default(DEFAULT_FAST_PATH),
	fastPathMaxChars: positiveInt().default(60),
	minConfidence: z.number().min(0).max(1).default(0.6),
	topicMaxChars: positiveInt().default(24),
	windowFirst: positiveInt().default(6),
	windowLast: z.number().step(1).min(0).default(12),
	modelTag: z.union([z.const("none"), z.const("suffix")]).default("none"),
	maxInputBytes: positiveInt().default(8192),
	maxOutputTokens: positiveInt().default(200),
	timeoutMs: positiveInt().default(60000),
	backfill: z.boolean().default(true),
	backfillMaxSessions: positiveInt().default(50),
	backfillMinEvents: positiveInt().default(3),
	backfillDelayMs: positiveInt().default(800),
	backfillStartupDelayMs: positiveInt().default(15000),
	backfillIncludeUserTitles: z.boolean().default(false),
	backfillIncludeSubagents: z.boolean().default(false),
	storePath: z.string(),
	provider: SessionTitleLlmConfigFields.provider,
	model: SessionTitleLlmConfigFields.model
});

/** Validate one positive target. */
function assertTarget(label, value) {
	if (!Number.isInteger(value) || value <= 0) throw new Error(`session-title-summary: ${label} must be a positive integer`);
	return value;
}

/** Validate configuration and split own policy from shared execution controls. */
function resolveConfig(config) {
	const {
		cadence, datePrefix, timeZone, builtinCategories, customCategories, synonyms,
		localFastPath, fastPathKeywords, fastPathMaxChars, minConfidence, topicMaxChars,
		windowFirst, windowLast, modelTag, storePath,
		backfill, backfillMaxSessions, backfillMinEvents, backfillDelayMs, backfillStartupDelayMs,
		backfillIncludeUserTitles, backfillIncludeSubagents,
		...execution
	} = config;
	if (cadence !== "first-prompt" && cadence !== "all-prompts") throw new Error("session-title-summary: cadence must be 'first-prompt' or 'all-prompts'");
	if (modelTag !== "none" && modelTag !== "suffix") throw new Error("session-title-summary: modelTag must be 'none' or 'suffix'");
	if (!Array.isArray(builtinCategories) || builtinCategories.length === 0) throw new Error("session-title-summary: builtinCategories must be a non-empty array");
	return {
		cadence, datePrefix, timeZone, builtinCategories, customCategories, synonyms,
		localFastPath, fastPathKeywords, fastPathMaxChars, minConfidence, topicMaxChars,
		modelTag, storePath,
		backfill,
		backfillMaxSessions: assertTarget("backfillMaxSessions", backfillMaxSessions),
		backfillMinEvents: assertTarget("backfillMinEvents", backfillMinEvents),
		backfillDelayMs: assertTarget("backfillDelayMs", backfillDelayMs),
		backfillStartupDelayMs: assertTarget("backfillStartupDelayMs", backfillStartupDelayMs),
		backfillIncludeUserTitles,
		backfillIncludeSubagents,
		execution: resolveSessionTitleLlmConfig(execution),
		windowFirst: assertTarget("windowFirst", windowFirst),
		windowLast: windowLast === 0 ? 0 : assertTarget("windowLast", windowLast)
	};
}

/** Select the least supported reasoning effort: a title needs none. */
const selectReasoningEffort = (model) => model.reasoning?.efforts[0]?.id;

/** System instruction for the categorized JSON title request. */
function systemPrompt(config, customCategories, hasAnchor) {
	return [
		`You title AI coding-assistant sessions. Analyze the JSON object in the user message: {model, omittedMessages, messages:[{seq,text}], currentTitle?}.`,
		`Existing categories, in priority order — prefer these when one fits reliably: ${[...config.builtinCategories, ...customCategories].join(", ")}.`,
		"When no existing category fits, invent ONE short new category word (1-6 characters, Chinese or English).",
		`"topic": the session's main subject in the language of the messages, about ${config.topicMaxChars} characters max, no quotes, no Markdown, no code.`,
		`"confidence": 0 to 1, how sure you are.`,
		...(hasAnchor ? [
			`"currentTitle" is the existing title. If it still accurately describes the main topic or task, set "should_rename": false and repeat its category and topic exactly.`,
			"Follow-up questions, extra details in the same topic, acknowledgements, and continue requests do not justify renaming; do not reword an adequate title.",
			"Set \"should_rename\": true only when the messages materially change or expand the main topic so the existing title is no longer accurate."
		] : [
			'"should_rename": true for a new session.'
		]),
		'Return ONLY one compact single-line JSON object, nothing else: {"category":"…","topic":"…","confidence":0.00,"should_rename":true,"reason":"≤10 chars"}'
	].join("\n");
}

/** Frame the cleaned window as the model input. */
function frameInput(model, cleaned, omitted, anchorInfo) {
	const payload = { model, omittedMessages: omitted, messages: cleaned };
	if (anchorInfo !== null) payload.currentTitle = anchorInfo;
	return `Categorize and title this session from the JSON object:\n${JSON.stringify(payload)}`;
}

/** Pick the fallback short-title text by priority: anchor topic, first message, last message. */
function fallbackShort(anchor, messages, maxChars) {
	const candidates = [];
	if (anchor !== undefined) candidates.push(parseTitleFormat(anchor)?.topic ?? anchor);
	if (messages.length > 0) candidates.push(messages[0].text);
	if (messages.length > 1) candidates.push(messages[messages.length - 1].text);
	for (const candidate of candidates) {
		const short = cleanShortTitle(candidate ?? "", maxChars);
		if (short.length >= 2) return short;
	}
	return "未命名会话";
}

/**
 * Register the categorized summary-title provider.
 * @param ctx - context exposing session-title, LLM, and session services.
 * @param config - category policy, pipeline gates, and shared execution controls.
 */
function apply(ctx, config) {
	const resolved = resolveConfig(config);
	const storePath = resolved.storePath ?? defaultStorePath();
	const monitor = new RunMonitor(join(dirname(storePath), "runs.json"));
	// User-selected fixed title model, persisted beside the stores and edited
	// from the panel's config tab: set → every title generation uses this
	// route; unset → each session follows its own (historical) model route.
	const settingsPath = join(dirname(storePath), "settings.json");
	const readOverride = () => {
		try {
			const raw = JSON.parse(readFileSync(settingsPath, "utf8"));
			if (raw.version === 1 && typeof raw.provider === "string" && typeof raw.model === "string" && raw.provider !== "" && raw.model !== "") {
				return { provider: raw.provider, model: raw.model };
			}
		} catch { /* absent or unreadable settings start unconfigured */ }
		return undefined;
	};
	let routeOverride = readOverride();
	const writeOverride = (provider, model) => {
		routeOverride = provider && model ? { provider, model } : undefined;
		mkdirSync(dirname(settingsPath), { recursive: true });
		const temp = `${settingsPath}.${randomUUID()}.tmp`;
		writeFileSync(temp, `${JSON.stringify({ version: 1, ...(routeOverride ?? {}) })}\n`, { mode: 0o600 });
		renameSync(temp, settingsPath);
	};
	const executions = new Map();
	const trackExecution = (sessionId, patch) => {
		if (monitor.state.current?.sessionId !== sessionId) return;
		executions.set(sessionId, { ...executions.get(sessionId), ...patch });
		monitor.update({ ...monitor.state.current, ...patch });
	};
	const store = new CategoryStore(storePath, resolved.customCategories);
	const titleProvider = SessionTitleProviderId(name);
	ctx.on("session/event", (session, event) => {
		if (event.type !== "session/title-llm-request") return;
		const route = event.data.route;
		if (route) trackExecution(session.id, { method: "model", status: "calling-model", provider: route.provider, model: route.model });
	});
	ctx.sessionTitle.register({
		id: titleProvider,
		automatic: resolved.cadence,
		async generate(request) {
			const date = mmdd(request.session.header.createdAt, resolved.timeZone);
			const knownCustom = [...new Set([...resolved.customCategories, ...store.list()])];
			// A nonconforming existing title is NOT an anchor to keep: it is
			// hidden from the model so generation always produces a fresh,
			// conforming title (user rule: nonconforming titles must be renamed).
			const rawTitle = request.currentTitle?.source.kind === "provider" ? request.currentTitle.title : undefined;
			const anchor = rawTitle !== undefined && parseTitleFormat(rawTitle) !== null ? rawTitle : undefined;
			const anchorInfo = anchor === undefined ? null : (() => {
				const parsed = parseTitleFormat(anchor);
				return parsed === null ? { topic: anchor } : parsed.category === null ? { topic: parsed.topic } : { category: parsed.category, topic: parsed.topic };
			})();
			const first = request.messages[0];

			// Phase 1: local fast path on a short, keyword-clear first message, only for a first title.
			let local = null;
			if (resolved.localFastPath && anchor === undefined && first !== undefined) {
				const head = first.text.split(/\r?\n/u)[0] ?? "";
				if (head.trim().length > 0 && head.length <= resolved.fastPathMaxChars) {
					const category = fastPathCategory(head, resolved.fastPathKeywords);
					if (category !== null) local = { category, topic: cleanShortTitle(head, resolved.topicMaxChars) };
				}
			}

			// Phase 3 outcome.
			let outcome;
			let usedSeqs = request.messages.map((message) => message.seq);

			if (local !== null && local.topic.length >= 2) {
				trackExecution(request.session.id, { method: "local", status: "generating", provider: null, model: null });
				outcome = { kind: "full", category: local.category, topic: local.topic };
			} else if (request.route === undefined && resolved.execution.provider === undefined && routeOverride === undefined) {
				// No logged model route and no fixed route configured: the LLM leg
				// cannot run at all — go straight to the two-part fallback title.
				trackExecution(request.session.id, { method: "fallback", status: "generating", provider: null, model: null, reason: "no-model-route" });
				outcome = { kind: "fallback" };
			} else {
				// Phase 2: cleaned window through the configured fixed route, or
				// the session's own model route when no override is configured.
				const route = routeOverride ?? request.route;
				const execution = routeOverride === undefined ? resolved.execution : { ...resolved.execution, provider: routeOverride.provider, model: routeOverride.model };
				const model = { provider: route.provider, model: route.model };
				const budget = Math.max(1024, resolved.execution.maxInputBytes - 256);
				const { selected, omitted } = selectWindow(request.messages, budget, resolved.windowFirst, resolved.windowLast);
				if (selected.length === 0) throw new Error("session-title-summary: no eligible human message is available");
				const cleaned = cleanForSend(selected);
				if (cleaned.length === 0) throw new Error("session-title-summary: no cleanable human message is available");
				usedSeqs = cleaned.map((message) => message.seq);
				trackExecution(request.session.id, { method: "model", status: "preparing-model" });
				const response = await executeSessionTitleLlm(ctx, execution, request, titleProvider, {
					system: systemPrompt(resolved, knownCustom, anchorInfo !== null),
					input: frameInput(model, cleaned, omitted, anchorInfo),
					messageSeqs: usedSeqs,
					selectReasoningEffort
				});
				if (response.finish.kind === "tool-calls") throw new Error("session-title-summary: title output must contain text only");
				if (response.finish.kind === "max-tokens") outcome = { kind: "fallback" };
				else {
					const text = response.blocks.filter((block) => block.type === "text").map((block) => block.text).join(" ");
					outcome = interpretModelResult(parseModelJson(text), {
						minConfidence: resolved.minConfidence,
						hasAnchor: anchorInfo !== null,
						topicMaxChars: resolved.topicMaxChars
					});
				}
			}

			// Phase 3: category mapping, validation, assembly.
			let title;
			if (outcome.kind === "keep" && anchor !== undefined) {
				title = anchor;
				const kept = parseTitleFormat(anchor)?.category;
				if (kept !== null && kept !== undefined && !resolved.builtinCategories.includes(kept)) store.recordUse(kept);
			} else if (outcome.kind === "full") {
				const mapped = mapCategory(outcome.category, { builtin: resolved.builtinCategories, custom: knownCustom, synonyms: resolved.synonyms });
				if (!mapped.matched) store.recordUse(mapped.category);
				else if (!resolved.builtinCategories.includes(mapped.category)) store.recordUse(mapped.category, outcome.category === mapped.category ? null : outcome.category);
				const safeTopic = cleanShortTitle(outcome.topic, resolved.topicMaxChars);
				title = safeTopic.length < 2
					? composeFallbackTitle(date, fallbackShort(anchor, request.messages, resolved.topicMaxChars))
					: composeTitle(date, mapped.category, safeTopic);
			} else {
				title = composeFallbackTitle(date, fallbackShort(anchor, request.messages, resolved.topicMaxChars));
			}

			const normalized = normalizeSessionTitle(title, Number.MAX_SAFE_INTEGER);
			if (normalized.length === 0) throw new Error("session-title-summary: composed title normalized to empty");
			const effectiveRoute = routeOverride ?? request.route;
			const finalTitle = resolved.modelTag === "suffix" && effectiveRoute !== undefined ? `${normalized} · ${effectiveRoute.model}` : normalized;
			return { title: finalTitle, messageSeqs: usedSeqs, model: effectiveRoute };
		}
	});

	// One owner for single-flight execution, cancellation, durable diagnostic cache.
	const controller = new AbortController();
	let active;
	const startBackfill = (reason) => {
		if (active || controller.signal.aborted) return false;
		monitor.start(reason);
		active = (async () => {
			try {
				const report = await backfillHistoricalSessions(ctx, resolved, controller.signal, {
					onInventory: (summary) => monitor.inventory(summary),
					onStart: (record) => monitor.update(record),
					onUpdate: (record) => monitor.update({ ...record, ...executions.get(record.sessionId), status: record.status }),
					onProgress: (progress) => { monitor.progress(progress); executions.delete(progress.record.sessionId); },
					getExecution: (id) => executions.get(id)
				});
				monitor.finish(report, controller.signal.aborted ? controller.signal.reason : undefined);
			} catch (error) { monitor.finish({}, error); }
			finally { active = undefined; executions.clear(); }
		})();
		return true;
	};
	ctx.effect(() => async () => {
		controller.abort(new Error("plugin-unloaded"));
		await active;
	}, "session-title-summary: scan lifetime");
	if (resolved.backfill) void sleep(resolved.backfillStartupDelayMs, controller.signal).then(() => startBackfill("activation"), () => {});
	registerPanelApi(ctx,
		() => ({ version: "1.6.0", builtin: resolved.builtinCategories, custom: store.data.custom, routeOverride: routeOverride ?? null, ...monitor.snapshot() }),
		startBackfill,
		async (override) => {
			writeOverride(override?.provider, override?.model);
			return routeOverride ?? null;
		},
		// Live provider/model catalog from the same LLM registry the official
		// model selector reads; each provider's failure is isolated.
		async () => {
			const providers = ctx.llm.listProviders();
			const groups = await Promise.all(providers.map(async (provider) => {
				try {
					const models = await ctx.llm.listModels(provider.id);
					return { id: provider.id, name: provider.name ?? provider.id, models: models.map((model) => ({ id: model.id, name: model.name ?? model.id })) };
				} catch (error) {
					return { id: provider.id, name: provider.name ?? provider.id, models: [], error: String(error?.message ?? error) };
				}
			}));
			return { groups };
		});
}

export { Config, apply, inject, name };
