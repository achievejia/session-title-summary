/** Pure title pipeline helpers with no Cordis imports, so they stay unit-testable. */

/** Byte length of one value once framed as JSON. */
export const jsonBytes = (value) => Buffer.byteLength(JSON.stringify(value), "utf8");

/** Cap one message's text so a single huge prompt cannot eat the whole budget. */
export function capText(text, capBytes) {
	if (Buffer.byteLength(text, "utf8") <= capBytes) return text;
	let out = text;
	while (out.length > 0 && Buffer.byteLength(out + "…", "utf8") > capBytes) out = out.slice(0, Math.floor(out.length * 0.9));
	return out + "…";
}

/**
 * Select a bounded window (first `windowFirst` + last `windowLast` messages)
 * whose JSON fits `budgetBytes`, always keeping message 0. The tail is
 * preserved first (recent messages track the current topic), then the head is
 * shrunk, then the tail; the middle is dropped (the omission count travels in
 * the model input) so the input always fits the byte limit even on very long
 * conversations. Each kept text is capped so one huge message cannot evict the
 * rest.
 * @param messages - full eligible human-message snapshot ({seq, text}).
 * @returns selected messages plus how many were omitted.
 */
export function selectWindow(messages, budgetBytes, windowFirst, windowLast) {
	const perMessageCap = Math.max(512, Math.floor(budgetBytes / 4));
	const capped = messages.map((message) => ({ ...message, text: capText(message.text, perMessageCap) }));
	if (jsonBytes(capped) <= budgetBytes) return { selected: capped, omitted: 0 };
	for (let tailCount = windowLast; tailCount >= 0; tailCount -= 1) {
		for (let headCount = Math.max(1, windowFirst); headCount >= 1; headCount -= 1) {
			const head = capped.slice(0, headCount);
			const tailStart = Math.max(head.length, capped.length - tailCount);
			const selected = [...head, ...capped.slice(tailStart)];
			if (jsonBytes(selected) <= budgetBytes) return { selected, omitted: capped.length - selected.length };
		}
	}
	return { selected: [capped[0]], omitted: capped.length - 1 };
}

//#region sensitive-content handling

/** Credential/token shapes that must never reach the model or a title. */
const CREDENTIAL_PATTERNS = [
	/(?:api[_-]?key|token|secret|password|passwd|pwd|授权码|密钥|密码)\s*[:=：]\s*["']?[^\s"'，。]{4,}/giu,
	/\bsk-[A-Za-z0-9_-]{8,}/g,
	/\bghp_[A-Za-z0-9]{16,}/g,
	/\bgho_[A-Za-z0-9]{16,}/g,
	/\bAKIA[0-9A-Z]{16}\b/g,
	/\bBearer\s+[A-Za-z0-9._-]{8,}/gi,
	/\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/g,
	/\b[A-Fa-f0-9]{32,}\b/g,
	/\b[A-Za-z0-9+/]{40,}={0,2}\b/g
];

/** Filesystem-path shapes (rejected inside categories and topics). */
const PATH_PATTERN = /(?:^|[\s（(【\[])(?:\/(?:Users|home|var|etc|opt|tmp|private|Applications|Library)\/\S+|~\/\S+|[A-Za-z]:\\{1,2}\S+)/u;

/** True when text carries a credential/token shape. */
export function containsCredential(text) {
	return CREDENTIAL_PATTERNS.some((pattern) => {
		pattern.lastIndex = 0;
		return pattern.test(text);
	});
}

/** True when text carries a filesystem path shape. */
export function containsPath(text) {
	return PATH_PATTERN.test(text);
}

/** Replace credential/token shapes with a fixed marker. */
export function scrubCredentials(text) {
	let out = text;
	for (const pattern of CREDENTIAL_PATTERNS) out = out.replace(pattern, "[已脱敏]");
	return out;
}

/** Elide long fenced code blocks and dedupe repeated message texts before sending. */
export function cleanForSend(messages) {
	const seen = new Set();
	const out = [];
	for (const message of messages) {
		const text = message.text.replace(/```[\s\S]{200,}?```/gu, "「代码省略」");
		if (seen.has(text)) continue;
		seen.add(text);
		out.push({ ...message, text: scrubCredentials(text) });
	}
	return out;
}

//#endregion

//#region title format: MMDD | 分类 | 主题

/** Format a Unix-ms timestamp as MMDD in the given IANA time zone. */
export function mmdd(createdAtMs, timeZone = "Asia/Shanghai") {
	const fmt = new Intl.DateTimeFormat("en-US", { month: "2-digit", day: "2-digit", timeZone, timeZoneName: "short" });
	const parts = fmt.formatToParts(new Date(createdAtMs));
	const month = parts.find((p) => p.type === "month")?.value;
	const day = parts.find((p) => p.type === "day")?.value;
	return `${month}${day}`;
}

/** Shape of a parsed valid-format title. */
export const TITLE_SEPARATOR = " | ";

/** Compose the full three-part title. */
export function composeTitle(date, category, topic) {
	return `${date}${TITLE_SEPARATOR}${category}${TITLE_SEPARATOR}${topic}`;
}

/** Compose the fallback two-part title. */
export function composeFallbackTitle(date, short) {
	return `${date}${TITLE_SEPARATOR}${short}`;
}

/** Parse `MMDD | 分类 | 主题` or `MMDD | 简短标题`; null when not the format. */
export function parseTitleFormat(title) {
	if (typeof title !== "string") return null;
	const parts = title.split(TITLE_SEPARATOR.trim());
	if (parts.length < 2) return null;
	const date = parts[0].trim();
	if (!/^(0[1-9]|1[0-2])(0[1-9]|[12]\d|3[01])$/.test(date)) return null;
	if (parts.length === 2) return { date, category: null, topic: parts[1].trim() };
	if (parts.length === 3 && parts[1].trim().length > 0 && parts[2].trim().length > 0) {
		return { date, category: parts[1].trim(), topic: parts[2].trim() };
	}
	return null;
}

//#endregion

//#region category mapping and validation

/** Options for category validation. */
const CATEGORY_CHARS = /^[\p{Script=Han}A-Za-z0-9·\-]{1,12}$/u;
const SENTENCE_PUNCTUATION = /[。！？!?，,、；;：:…「」“”\s]{2,}|[。！？!?；;]/u;

/** Sentence-function wording that marks a phrase as a sentence, not a category word. */
const SENTENCE_WORDING = /(这是|那个|这些|帮我|请你|请我|需要|应该|进行|一个|可以|如何|怎么)/u;

/** Validate one category word against the structural rules. */
export function isValidCategory(category) {
	if (typeof category !== "string") return false;
	const value = category.trim();
	if (value.length === 0 || value !== category) return false;
	if (!CATEGORY_CHARS.test(value)) return false;
	if (SENTENCE_PUNCTUATION.test(value)) return false;
	if (SENTENCE_WORDING.test(value)) return false;
	if (/^[\p{Script=Han}]+$/u.test(value) && value.length > 6) return false;
	if (value.includes("|")) return false;
	if (containsCredential(value) || containsPath(value)) return false;
	return true;
}

/** Validate one topic phrase against the structural rules. */
export function isValidTopic(topic, maxChars = 24) {
	if (typeof topic !== "string") return false;
	const value = topic.trim();
	if (value.length < 2 || value.length > maxChars) return false;
	if (value.includes("|") || /[\r\n]/u.test(value)) return false;
	if (containsCredential(value) || containsPath(value)) return false;
	return true;
}

/**
 * Map a raw model category onto the known vocabulary.
 * Exact builtin match wins, then exact custom match, then the ordered synonym
 * table (exact equality first, then substring containment), else the raw word
 * is kept as a new custom category.
 * @returns the final category plus whether a known entry matched.
 */
export function mapCategory(raw, { builtin, custom, synonyms = [] }) {
	const value = typeof raw === "string" ? raw.trim() : "";
	if (builtin.includes(value)) return { category: value, matched: true };
	if (custom.includes(value)) return { category: value, matched: true };
	for (const [needle, canonical] of synonyms) {
		if (value === needle) return { category: canonical, matched: true };
	}
	for (const [needle, canonical] of synonyms) {
		if (needle.length > 0 && value.includes(needle)) return { category: canonical, matched: true };
	}
	return { category: value, matched: false };
}

/** Local fast-path keyword table entry match: keyword containment on a short first message. */
export function fastPathCategory(text, keywords) {
	for (const [needle, category] of keywords) {
		if (needle.length > 0 && text.toLowerCase().includes(needle.toLowerCase())) return category;
	}
	return null;
}

//#endregion

//#region model-output interpretation

/** Extract the first JSON object from model text (tolerating code fences and prose). */
export function parseModelJson(text) {
	if (typeof text !== "string") return null;
	const stripped = text.replace(/```(?:json)?/gi, "").trim();
	const start = stripped.indexOf("{");
	const end = stripped.lastIndexOf("}");
	if (start < 0 || end <= start) return null;
	try {
		const value = JSON.parse(stripped.slice(start, end + 1));
		return value !== null && typeof value === "object" ? value : null;
	} catch {
		return null;
	}
}

/** Asterisk emphasis wrapping a whole line, such as `**Title**`. */
const EMPHASIS_WRAPPER = /^(?<marker>\*{1,3})(?<inner>\S(?:.*\S)?)\k<marker>$/u;

/** First non-empty output line without whole-line asterisk emphasis. */
export function titleFromOutput(text) {
	const line = text.split(/\r?\n/u).map((item) => item.trim()).find((item) => item.length > 0) ?? "";
	const groups = EMPHASIS_WRAPPER.exec(line)?.groups;
	const marker = groups?.["marker"];
	const inner = groups?.["inner"];
	return marker === undefined || inner === undefined || inner.includes(marker) ? line : inner;
}

/** Options for interpretModelResult. */
/**
 * Interpret one parsed model result against the local gates.
 * @returns {kind:'keep'} to keep the anchor, {kind:'full', category, topic} for
 * a confident three-part result, or {kind:'fallback'} when any gate fails.
 */
export function interpretModelResult(parsed, { minConfidence = 0.6, hasAnchor = false, topicMaxChars = 24 } = {}) {
	if (parsed === null) return { kind: "fallback" };
	if (hasAnchor && parsed.should_rename === false) return { kind: "keep" };
	const confidence = typeof parsed.confidence === "number" ? parsed.confidence : 0;
	if (confidence < minConfidence) return { kind: "fallback" };
	if (!isValidCategory(parsed.category)) return { kind: "fallback" };
	if (!isValidTopic(parsed.topic, topicMaxChars)) return { kind: "fallback" };
	return { kind: "full", category: parsed.category.trim(), topic: parsed.topic.trim() };
}

/** Clean any free text into a short fallback title part. */
export function cleanShortTitle(text, maxChars = 24) {
	if (typeof text !== "string") return "";
	let value = scrubCredentials(text);
	const parsed = parseTitleFormat(value);
	if (parsed !== null) value = parsed.category !== null ? parsed.topic : parsed.topic;
	value = titleFromOutput(value.split(/\r?\n/u)[0] ?? "");
	value = value.replace(/[|｜]/gu, " ").replace(/\s+/gu, " ").trim();
	value = value.replace(/^[#>\-*\s]+/u, "").trim();
	value = value.replace(/[。！？!?，,、；;：:\s]+$/u, "");
	if (value.length > maxChars) value = value.slice(0, maxChars - 1) + "…";
	return value;
}

//#endregion
