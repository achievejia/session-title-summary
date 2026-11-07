// Browser half of @local/session-title-summary. Only React is a runtime import.
window.__ModuleLoader__.load({
	id: '@local/session-title-summary',
	factory(require) {
		const React = require('react');
		const h = React.createElement;
		const { useCallback, useEffect, useRef, useState } = React;
		const PANEL_ID = 'session-title-summary';
		const NS = '@local/session-title-summary';
		const POLL_MS = 2000;
		const REQUEST_TIMEOUT_MS = 15000;
		const ACTIVE_STATES = ['scanning', 'generating', 'preparing-model', 'calling-model', 'persisting', 'running'];

		const DICTS = {
			zh: {
				'entry.label': '会话标题',
				'panel.title': '会话摘要标题',
				'panel.subtitle': 'MMDD | 分类 | 主题 · 自动命名与历史回填',
				'panel.version': 'Host 版本',
				'section.backfill': '扫描与处理',
				'section.builtin': '内置分类',
				'section.custom': '动态分类',
				'section.history': '最近 10 次运行',
				'section.records': '处理记录',
				'section.current': '正在处理',
				'connection.loading': '正在连接 Host，读取扫描状态…',
				'connection.error': '状态不可用，不能确认当前是否空闲',
				'connection.stale': '保留上次成功读取的数据；运行状态可能已变化。',
				'connection.synced': '状态更新时间',
				'connection.poll': '每 2 秒串行更新',
				'action.scan': '重新扫描',
				'action.pending': '正在提交扫描…',
				'action.retry': '重试连接',
				'action.refreshing': '正在刷新…',
				'action.failure': '扫描请求失败',
				'run.idle': '空闲',
				'run.running': '正在扫描会话',
				'run.unknown': '等待状态',
				'run.error': '运行异常',
				'run.last': '上次运行',
				'run.never': '尚无运行记录',
				'run.latest': '最新运行（自动跟随）',
				'run.select': '选择运行',
				'run.source': '触发来源',
				'run.id': '运行 ID',
				'run.started': '开始时间',
				'run.finished': '结束时间',
				'run.inProgress': '尚未结束',
				'run.emptyHistory': '扫描后可查看每次运行的统计与处理记录。',
				'run.selectHint': '选择历史运行，可查询当次记录；实时处理始终显示当前会话。',
				'metric.discovered': '发现会话',
				'metric.considered': '纳入检查',
				'metric.scanned': '已扫描',
				'metric.renamed': '已修改',
				'metric.skipped': '已跳过',
				'metric.failed': '失败',
				'record.id': '会话 ID',
				'record.fullId': '展开完整会话 ID',
				'record.created': '会话创建',
				'record.old': '原标题',
				'record.new': '新标题',
				'record.model': '实际调用模型',
				'record.provider': '供应商',
				'record.noModel': '未调用模型',
				'record.method': '处理方式',
				'record.reason': '原因 / 说明',
				'record.noReason': 'Host 未提供原因',
				'record.untitled': '无标题',
				'record.noNewTitle': '尚无新标题',
				'record.noCurrent': '等待 Host 报告正在处理的会话…',
				'record.empty': '此运行尚无处理记录。',
				'record.noMatch': '没有符合筛选条件的记录。',
				'record.count': '匹配 / 总记录',
				'filter.query': '搜索记录',
				'filter.placeholder': '会话 ID、原标题、新标题、模型或原因',
				'filter.status': '处理状态',
				'filter.all': '全部状态',
				'filter.clear': '清除筛选',
				'table.status': '结果',
				'table.session': '会话',
				'table.old': '原标题',
				'table.new': '新标题',
				'table.model': '模型',
				'table.method': '方式',
				'table.reason': '原因',
				'table.finished': '完成时间',
				'table.expand': '展开或收起该行详情',
				'tab.records': '处理记录',
				'tab.config': '模型配置',
				'section.config': '标题生成模型',
				'config.hint': '未配置时：标题跟随每个会话自己的模型路由，无路由的会话用简短标题回退。配置后：所有标题生成（含历史回填）统一使用该固定模型。',
				'config.current': '当前配置',
				'config.none': '未配置（跟随会话模型）',
				'config.provider': '供应商（provider）',
				'config.model': '模型（model）',
				'config.save': '保存配置',
				'config.clear': '清除配置',
				'config.saved': '已保存，之后所有标题生成使用该模型',
				'config.cleared': '已清除，恢复跟随会话模型',
				'config.pairRequired': '供应商与模型必须同时填写，或同时留空',
				'config.seen': '最近实际调用过的模型（点击直接采用）',
				'config.loadingModels': '正在从当前程序拉取模型供应商…',
				'config.modelsError': '模型目录获取失败',
				'config.pickProvider': '请选择供应商',
				'config.pickModel': '请选择模型',
				'config.pickProviderFirst': '请先选择供应商',
				'config.providerFailed': '列表获取失败',
				'config.modelNotInProvider': '该模型不在所选供应商的模型列表中，请重新选择',
				'config.reload': '刷新模型列表',
				'status.preparing-model': '准备模型请求',
				'status.interrupted': '已中断（重启或卸载）',
				'method.none': '未执行生成',
				'reason.live-session': '会话已打开，避免干扰',
				'reason.batch-limit': '超过本次批量上限',
				'reason.unchanged': '标题未变化',
				'reason.no-model-route': '无模型路由，使用简短标题回退',
				'reason.no-title-accepted': '标题服务未接受新标题',
				'reason.cancelled': '本次处理已取消',
				'status.scanning': '扫描中',
				'status.generating': '生成标题中',
				'status.calling-model': '正在调用模型',
				'status.persisting': '正在保存标题',
				'status.running': '运行中',
				'status.renamed': '已修改',
				'status.skipped': '已跳过',
				'status.failed': '失败',
				'status.completed': '已完成',
				'status.finished': '已完成',
				'status.succeeded': '成功',
				'status.idle': '空闲',
				'status.unknown': '未提供状态',
				'method.model': '模型生成',
				'method.local': '本地处理',
				'method.fallback': '回退生成',
				'method.unknown': '未提供',
				'source.activation': '插件激活',
				'source.panel': '面板扫描',
				'source.manual': '手动触发',
				'source.startup': '启动回填',
				'reason.events-below-minimum': '消息数不足',
				'reason.valid-format': '已有合法格式',
				'reason.user-pinned': '用户手动命名',
				'reason.subagent': '子代理会话',
				'reason.session-in-use': '会话正在使用',
				'category.empty': '暂无动态分类',
				'category.count': '次',
				'error.timeout': '请求超时，请重试',
				'error.invalid': 'Host 返回了无效状态',
				'error.http': 'HTTP',
				'error.notFound': '接口未找到，请确认 Host 路由与桌面适配已加载',
				'error.auth': '认证失败，请重新连接当前应用',
				'error.network': '网络请求失败',
				'empty.value': '—'
			},
			en: {
				'entry.label': 'Session Titles',
				'panel.title': 'Session Summary Titles',
				'panel.subtitle': 'MMDD | Category | Topic · automatic naming and history backfill',
				'panel.version': 'Host version',
				'section.backfill': 'Scan and processing',
				'section.builtin': 'Built-in categories',
				'section.custom': 'Dynamic categories',
				'section.history': 'Last 10 runs',
				'section.records': 'Processing records',
				'section.current': 'Currently processing',
				'connection.loading': 'Connecting to Host and reading scan status…',
				'connection.error': 'Status unavailable; idle state cannot be confirmed',
				'connection.stale': 'Keeping the last successful snapshot; the run state may have changed.',
				'connection.synced': 'Status updated',
				'connection.poll': 'Serial updates every 2 seconds',
				'action.scan': 'Rescan sessions',
				'action.pending': 'Submitting scan…',
				'action.retry': 'Retry connection',
				'action.refreshing': 'Refreshing…',
				'action.failure': 'Scan request failed',
				'run.idle': 'Idle',
				'run.running': 'Scanning sessions',
				'run.unknown': 'Waiting for status',
				'run.error': 'Run error',
				'run.last': 'Last run',
				'run.never': 'No runs yet',
				'run.latest': 'Latest run (follow live)',
				'run.select': 'Select a run',
				'run.source': 'Trigger',
				'run.id': 'Run ID',
				'run.started': 'Started',
				'run.finished': 'Finished',
				'run.inProgress': 'In progress',
				'run.emptyHistory': 'After a scan, inspect each run’s counts and processing records here.',
				'run.selectHint': 'Select a historical run to query its records. Live processing always shows the current session.',
				'metric.discovered': 'Discovered',
				'metric.considered': 'Considered',
				'metric.scanned': 'Scanned',
				'metric.renamed': 'Renamed',
				'metric.skipped': 'Skipped',
				'metric.failed': 'Failed',
				'record.id': 'Session ID',
				'record.fullId': 'Expand full session ID',
				'record.created': 'Session created',
				'record.old': 'Old title',
				'record.new': 'New title',
				'record.model': 'Actual model called',
				'record.provider': 'Provider',
				'record.noModel': 'No model called',
				'record.method': 'Method',
				'record.reason': 'Reason / detail',
				'record.noReason': 'No reason supplied by Host',
				'record.untitled': 'Untitled',
				'record.noNewTitle': 'No new title yet',
				'record.noCurrent': 'Waiting for Host to report the session being processed…',
				'record.empty': 'This run has no processing records yet.',
				'record.noMatch': 'No records match these filters.',
				'record.count': 'Matching / total records',
				'filter.query': 'Search records',
				'filter.placeholder': 'Session ID, old/new title, model, or reason',
				'filter.status': 'Processing status',
				'filter.all': 'All statuses',
				'filter.clear': 'Clear filters',
				'table.status': 'Result',
				'table.session': 'Session',
				'table.old': 'Old title',
				'table.new': 'New title',
				'table.model': 'Model',
				'table.method': 'Method',
				'table.reason': 'Reason',
				'table.finished': 'Finished',
				'table.expand': 'Toggle row details',
				'tab.records': 'Records',
				'tab.config': 'Model',
				'section.config': 'Title generation model',
				'config.hint': 'Unset: each title follows its session own model route, with a short-title fallback when none exists. Set: every title generation (history backfill included) uses this fixed model.',
				'config.current': 'Current',
				'config.none': 'Not set (follow session model)',
				'config.provider': 'Provider',
				'config.model': 'Model',
				'config.save': 'Save',
				'config.clear': 'Clear',
				'config.saved': 'Saved; every title now uses this model',
				'config.cleared': 'Cleared; back to session models',
				'config.pairRequired': 'Provider and model must be filled together, or left empty together',
				'config.seen': 'Recently called models (click to adopt)',
				'config.loadingModels': 'Loading model providers from this app…',
				'config.modelsError': 'Failed to load the model catalog',
				'config.pickProvider': 'Select a provider',
				'config.pickModel': 'Select a model',
				'config.pickProviderFirst': 'Select a provider first',
				'config.providerFailed': 'list unavailable',
				'config.modelNotInProvider': 'That model is not in the selected provider; choose again',
				'config.reload': 'Reload models',
				'status.preparing-model': 'Preparing model request',
				'status.interrupted': 'Interrupted (restart or unload)',
				'method.none': 'No generation',
				'reason.live-session': 'Already open; left untouched',
				'reason.batch-limit': 'Beyond this batch limit',
				'reason.unchanged': 'Title unchanged',
				'reason.no-model-route': 'No model route; short-title fallback',
				'reason.no-title-accepted': 'No title accepted by title service',
				'reason.cancelled': 'Processing cancelled',
				'status.scanning': 'Scanning',
				'status.generating': 'Generating title',
				'status.calling-model': 'Calling model',
				'status.persisting': 'Saving title',
				'status.running': 'Running',
				'status.renamed': 'Renamed',
				'status.skipped': 'Skipped',
				'status.failed': 'Failed',
				'status.completed': 'Completed',
				'status.finished': 'Completed',
				'status.succeeded': 'Succeeded',
				'status.idle': 'Idle',
				'status.unknown': 'Status not supplied',
				'method.model': 'Model generation',
				'method.local': 'Local processing',
				'method.fallback': 'Fallback generation',
				'method.unknown': 'Not supplied',
				'source.activation': 'Plugin activation',
				'source.panel': 'Panel scan',
				'source.manual': 'Manual',
				'source.startup': 'Startup backfill',
				'reason.events-below-minimum': 'Too few messages',
				'reason.valid-format': 'Already in valid format',
				'reason.user-pinned': 'User-pinned title',
				'reason.subagent': 'Subagent session',
				'reason.session-in-use': 'Session in use',
				'category.empty': 'No dynamic categories yet',
				'category.count': 'uses',
				'error.timeout': 'Request timed out; please retry',
				'error.invalid': 'Host returned an invalid status',
				'error.http': 'HTTP',
				'error.notFound': 'Endpoint not found; confirm the Host route and desktop adapter are loaded',
				'error.auth': 'Authentication failed; reconnect the current application',
				'error.network': 'Network request failed',
				'empty.value': '—'
			}
		};

		// Component-owned CSS is removed with its slot; all colors inherit theme tokens.
		const CSS = `
.session-title-summary { box-sizing: border-box; flex: 1 1 auto; height: 100%; min-height: 0; overflow-y: auto; overscroll-behavior: contain; scrollbar-width: thin; width: 100%; margin: 0 auto; padding: 1.5rem; color: var(--dsw-alias-label-primary); font-size: .8125rem; line-height: 1.5; }
.session-title-summary * { box-sizing: border-box; }
.session-title-summary h1 { font-size: 1.25rem; line-height: 1.4; margin: 0; }
.session-title-summary h2 { font-size: .9375rem; margin: 0 0 .75rem; }
.session-title-summary h3 { font-size: .8125rem; margin: 0 0 .5rem; }
.session-title-summary p { margin: .25rem 0; }
.session-title-summary .sts-muted { color: var(--dsw-alias-label-secondary); }
.session-title-summary .sts-header { margin-bottom: 1.5rem; }
.session-title-summary .sts-tabs { display: flex; gap: .5rem; border-bottom: 1px solid var(--dsw-alias-border-l2); margin-bottom: 1.25rem; }
.session-title-summary .sts-tabs button { border: 1px solid transparent; border-bottom: none; border-radius: .375rem .375rem 0 0; background: transparent; min-height: 2rem; }
.session-title-summary .sts-tabs button.sts-tab-active { background: var(--dsw-alias-bg-layer-2); border-color: var(--dsw-alias-border-l2); font-weight: 600; }
.session-title-summary .sts-section { border-top: 1px solid var(--dsw-alias-border-l1); padding: 1.25rem 0; }
.session-title-summary .sts-toolbar { display: flex; align-items: center; justify-content: space-between; flex-wrap: wrap; gap: .75rem; margin-bottom: .75rem; }
.session-title-summary .sts-actions, .session-title-summary .sts-meta { display: flex; align-items: center; flex-wrap: wrap; gap: .5rem 1rem; }
.session-title-summary button, .session-title-summary input, .session-title-summary select { font: inherit; color: var(--dsw-alias-label-primary); border: 1px solid var(--dsw-alias-border-l2); border-radius: .375rem; background: var(--dsw-alias-bg-layer-1); min-height: 2.25rem; padding: .375rem .75rem; }
.session-title-summary button { cursor: pointer; }
.session-title-summary button:hover:not(:disabled) { background: var(--dsw-alias-bg-layer-2); }
.session-title-summary button:disabled { opacity: .55; cursor: not-allowed; }
.session-title-summary button:focus-visible, .session-title-summary input:focus-visible, .session-title-summary select:focus-visible, .session-title-summary summary:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: 2px; }
.session-title-summary .sts-primary { border-color: var(--dsw-alias-brand-primary); font-weight: 600; }
.session-title-summary .sts-notice { padding: .75rem 1rem; margin: .75rem 0; border: 1px solid var(--dsw-alias-border-l2); border-radius: .5rem; background: var(--dsw-alias-bg-layer-1); overflow-wrap: anywhere; }
.session-title-summary .sts-error { border-color: var(--dsw-alias-state-error-primary); }
.session-title-summary .sts-error-text { color: var(--dsw-alias-state-error-primary); }
.session-title-summary .sts-success { color: var(--dsw-alias-state-success-primary); }
.session-title-summary .sts-badge { display: inline-flex; align-items: center; padding: .125rem .5rem; border: 1px solid var(--dsw-alias-border-l1); border-radius: .25rem; background: var(--dsw-alias-bg-layer-2); font-size: .75rem; overflow-wrap: anywhere; }
.session-title-summary .sts-metrics { display: grid; grid-template-columns: repeat(6, minmax(0, 1fr)); gap: .75rem; margin: 1rem 0; }
.session-title-summary .sts-metric { border-left: 2px solid var(--dsw-alias-border-l2); padding-left: .75rem; }
.session-title-summary .sts-metric strong { display: block; font-size: 1.25rem; font-variant-numeric: tabular-nums; }
.session-title-summary .sts-metric span { color: var(--dsw-alias-label-secondary); font-size: .75rem; }
.session-title-summary .sts-current { padding: 1rem; margin-top: 1rem; border: 1px solid var(--dsw-alias-border-l2); border-radius: .5rem; background: var(--dsw-alias-bg-layer-1); }
.session-title-summary .sts-record { padding: 1rem 0; border-bottom: 1px solid var(--dsw-alias-border-l1); min-width: 0; }
.session-title-summary .sts-current .sts-record { border-bottom: 0; padding: 0; }
.session-title-summary .sts-record-top { display: flex; align-items: flex-start; justify-content: space-between; flex-wrap: wrap; gap: .5rem; margin-bottom: .5rem; }
.session-title-summary .sts-id { min-width: 0; }
.session-title-summary summary { cursor: pointer; overflow-wrap: anywhere; }
.session-title-summary code { font-size: .75rem; overflow-wrap: anywhere; white-space: normal; }
.session-title-summary .sts-id code { display: block; padding-top: .25rem; user-select: all; }
.session-title-summary dl { display: grid; grid-template-columns: minmax(6rem, 8rem) minmax(0, 1fr); gap: .375rem .75rem; margin: .5rem 0 0; }
.session-title-summary dt { color: var(--dsw-alias-label-secondary); }
.session-title-summary dd { margin: 0; white-space: pre-wrap; overflow-wrap: anywhere; }
.session-title-summary .sts-filters { display: grid; grid-template-columns: minmax(0, 1fr) minmax(10rem, 14rem); gap: .75rem; margin: 1rem 0 .75rem; }
.session-title-summary label { display: flex; flex-direction: column; gap: .375rem; color: var(--dsw-alias-label-secondary); min-width: 0; }
.session-title-summary input, .session-title-summary select { width: 100%; min-width: 0; }
.session-title-summary .sts-run-select { max-width: 32rem; margin-top: .75rem; }
.session-title-summary .sts-history { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: .5rem; padding: 0; margin: .75rem 0; list-style: none; }
.session-title-summary .sts-history button { text-align: left; width: 100%; height: 100%; }
.session-title-summary .sts-history button[aria-pressed="true"] { border-color: var(--dsw-alias-brand-primary); background: var(--dsw-alias-bg-layer-2); }
.session-title-summary .sts-history small { display: block; color: var(--dsw-alias-label-secondary); margin-top: .25rem; }
.session-title-summary .sts-categories { display: grid; grid-template-columns: repeat(2, minmax(0, 1fr)); gap: 1.5rem; }
.session-title-summary .sts-chips { display: flex; flex-wrap: wrap; gap: .5rem; }
.session-title-summary .sts-category-row { display: flex; justify-content: space-between; gap: 1rem; padding: .375rem 0; border-bottom: 1px solid var(--dsw-alias-border-l1); }
.session-title-summary .sts-table-wrap { overflow-x: auto; margin-top: .75rem; border: 1px solid var(--dsw-alias-border-l1); border-radius: .5rem; }
.session-title-summary .sts-table { width: 100%; border-collapse: collapse; font-size: .75rem; }
.session-title-summary .sts-table th { position: sticky; top: 0; z-index: 1; text-align: left; font-weight: 600; color: var(--dsw-alias-label-secondary); background: var(--dsw-alias-bg-layer-1); padding: .5rem .625rem; border-bottom: 1px solid var(--dsw-alias-border-l2); white-space: nowrap; }
.session-title-summary .sts-table td { padding: .5rem .625rem; border-bottom: 1px solid var(--dsw-alias-border-l1); vertical-align: top; min-width: 0; }
.session-title-summary .sts-table tbody tr { cursor: pointer; }
.session-title-summary .sts-table tbody tr:hover td, .session-title-summary .sts-table tbody tr.sts-row-open td { background: var(--dsw-alias-bg-layer-2); }
.session-title-summary .sts-table tbody tr:focus-visible { outline: 2px solid var(--dsw-alias-brand-primary); outline-offset: -2px; }
.session-title-summary .sts-trunc { max-width: 20rem; overflow: hidden; text-overflow: ellipsis; white-space: nowrap; }
.session-title-summary .sts-nowrap { white-space: nowrap; }
.session-title-summary .sts-detail-row td, .session-title-summary .sts-detail-row:hover td { background: var(--dsw-alias-bg-layer-1); cursor: default; border-bottom: 1px solid var(--dsw-alias-border-l2); }
@media (max-width: 48rem) { .session-title-summary { padding: 1rem; } .session-title-summary .sts-metrics { grid-template-columns: repeat(3, minmax(0, 1fr)); } .session-title-summary .sts-history { grid-template-columns: minmax(0, 1fr); } }
@media (max-width: 30rem) { .session-title-summary .sts-filters, .session-title-summary .sts-categories { grid-template-columns: minmax(0, 1fr); } .session-title-summary dl { grid-template-columns: minmax(0, 1fr); gap: .125rem; } .session-title-summary dd { margin-bottom: .5rem; } }
`;

		function translated(t, prefix, value, emptyKey = 'empty.value') {
			if (!value) return t(emptyKey);
			const key = `${prefix}.${value}`;
			const text = t(key);
			return text && text !== key ? text : String(value);
		}

		function formatTime(value, t) {
			if (value == null || value === '') return t('empty.value');
			const date = new Date(value);
			if (Number.isNaN(date.getTime())) return String(value);
			return date.toLocaleString();
		}

		function errorMessage(error, t) {
			if (!error) return '';
			if (typeof error === 'string') return error;
			if (error.code) {
				const message = t(`error.${error.code}`);
				return error.detail ? `${message}: ${error.detail}` : message;
			}
			return String(error.message || error.reason || JSON.stringify(error));
		}

		function endpoint(name) {
			const relative = `api/session-title-summary/${name}`;
			// Desktop fetch adapters require a path without a leading slash.
			if (!/^https?:$/.test(window.location.protocol)) return relative;
			return new URL(relative, document.baseURI).toString();
		}

		async function request(name, options, signal) {
			const response = await fetch(endpoint(name), {
				...options,
				credentials: 'same-origin',
				headers: { accept: 'application/json', ...options?.headers },
				cache: 'no-store',
				signal
			});
			if (!response.ok) {
				const error = new Error(`HTTP ${response.status}`);
				error.code = response.status === 404 ? 'notFound'
					: response.status === 401 || response.status === 403 ? 'auth' : 'http';
				error.detail = `HTTP ${response.status}`;
				// Preserve a Host-provided failure reason without displaying HTML error pages.
				try {
					const body = await response.json();
					const detail = body?.error || body?.reason || body?.message;
					if (detail) error.detail += ` · ${errorMessage(detail, (key) => key)}`;
				} catch { /* the HTTP status is sufficient when no JSON detail exists */ }
				throw error;
			}
			const body = await response.json();
			if (!body || typeof body !== 'object' || Array.isArray(body)) {
				throw Object.assign(new Error('Invalid Host response'), { code: 'invalid' });
			}
			return body;
		}

		/** One status request at a time; the next poll starts after it settles. */
		function useStatus() {
			const [data, setData] = useState(null);
			const [loadError, setLoadError] = useState(null);
			const [actionError, setActionError] = useState(null);
			const [refreshing, setRefreshing] = useState(false);
			const [posting, setPosting] = useState(false);
			const [syncedAt, setSyncedAt] = useState(null);
			const latest = useRef(null);
			const connectionError = useRef(null);
			const refreshRef = useRef(null);
			const postRef = useRef(null);
			const postLock = useRef(false);
			const mounted = useRef(false);

			useEffect(() => {
				mounted.current = true;
				let disposed = false;
				let pollTimer;
				let activeController;
				let flight = null;

				async function refresh(afterExisting = false) {
					if (disposed) return;
					if (flight) {
						await flight;
						return afterExisting && !disposed ? refresh(false) : undefined;
					}
					clearTimeout(pollTimer);
					const controller = new AbortController();
					activeController = controller;
					let timedOut = false;
					const timeout = setTimeout(() => {
						timedOut = true;
						controller.abort();
					}, REQUEST_TIMEOUT_MS);
					setRefreshing(true);
					flight = (async () => {
						try {
							const snapshot = await request('status', {}, controller.signal);
							if (typeof snapshot.running !== 'boolean') {
								throw Object.assign(new Error('Missing running state'), { code: 'invalid' });
							}
							if (disposed) return;
							latest.current = snapshot;
							connectionError.current = null;
							setData(snapshot);
							setLoadError(null);
							setSyncedAt(Date.now());
						} catch (error) {
							if (disposed) return;
							const failure = timedOut ? { code: 'timeout' } : error;
							connectionError.current = failure;
							setLoadError(failure);
						} finally {
							clearTimeout(timeout);
							if (!disposed) {
								setRefreshing(false);
								pollTimer = setTimeout(() => { void refresh(); }, POLL_MS);
							}
						}
					})();
					await flight;
					flight = null;
				}

				refreshRef.current = refresh;
				void refresh();
				return () => {
					disposed = true;
					mounted.current = false;
					refreshRef.current = null;
					clearTimeout(pollTimer);
					activeController?.abort();
					postRef.current?.abort();
				};
			}, []);

			const refresh = useCallback(() => refreshRef.current?.(), []);
			const scan = useCallback(async () => {
				// A ref guards the same event loop tick, before React disables the button.
				if (postLock.current || !latest.current || latest.current.running || connectionError.current) return;
				postLock.current = true;
				setPosting(true);
				setActionError(null);
				const controller = new AbortController();
				postRef.current = controller;
				let timedOut = false;
				const timeout = setTimeout(() => {
					timedOut = true;
					controller.abort();
				}, REQUEST_TIMEOUT_MS);
				try {
					await request('backfill', { method: 'POST', headers: { 'content-type': 'application/json' } }, controller.signal);
					// Read after any older GET, never accept its pre-scan idle snapshot.
					await refreshRef.current?.(true);
				} catch (error) {
					if (mounted.current) {
						setActionError(timedOut ? { code: 'timeout' } : error);
						// A timed-out POST might still run on Host; re-read before allowing a retry.
						await refreshRef.current?.(true);
					}
				} finally {
					clearTimeout(timeout);
					postLock.current = false;
					postRef.current = null;
					if (mounted.current) setPosting(false);
				}
			}, []);

			return { data, loadError, actionError, refreshing, posting, syncedAt, refresh, scan };
		}

		function PanelIcon({ size }) {
			return h('svg', {
				viewBox: '0 0 16 16', width: size, height: size, fill: 'none',
				stroke: 'currentColor', strokeWidth: 1.3, strokeLinecap: 'round',
				strokeLinejoin: 'round', 'aria-hidden': true, 'data-dsh-panel-entry': PANEL_ID
			},
				h('path', { d: 'M2.5 4.5h7l4 3.5-4 3.5h-7z' }),
				h('circle', { cx: 5.4, cy: 8, r: .9, fill: 'currentColor', stroke: 'none' })
			);
		}

		function StatusBadge({ status, t }) {
			const tone = status === 'failed' ? ' sts-error-text' : status === 'renamed' ? ' sts-success' : '';
			return h('span', { className: `sts-badge${tone}` }, translated(t, 'status', status, 'status.unknown'));
		}

		function Detail({ label, children, className }) {
			return h(React.Fragment, null, h('dt', null, label), h('dd', { className }, children));
		}

		function SessionId({ id, t }) {
			if (!id) return h('span', { className: 'sts-muted' }, t('empty.value'));
			return h('details', { className: 'sts-id' },
				h('summary', { title: t('record.fullId') }, `${t('record.id')}: …${String(id).slice(-12)}`),
				h('code', null, String(id))
			);
		}

		function ModelValue({ record, t }) {
			// Only actual telemetry counts. A session route or label alone is not a call.
			if (!record.model) return h('span', { className: 'sts-muted' }, t('record.noModel'));
			const raw = `${record.provider ? `${record.provider} / ` : ''}${record.model}`;
			return h('span', null,
				record.modelLabel ? `${record.modelLabel} · ` : '',
				h('code', null, raw)
			);
		}

		function RecordCard({ record, t }) {
			const reason = record.reason ? translated(t, 'reason', record.reason) : '';
			return h('article', { className: 'sts-record' },
				h('div', { className: 'sts-record-top' },
					h(SessionId, { id: record.sessionId, t }),
					h(StatusBadge, { status: record.status, t })
				),
				h('dl', null,
					h(Detail, { label: t('record.old') }, record.oldTitle || t('record.untitled')),
					h(Detail, { label: t('record.new'), className: record.status === 'renamed' ? 'sts-success' : '' }, record.newTitle || t('record.noNewTitle')),
					h(Detail, { label: t('record.model') }, h(ModelValue, { record, t })),
					h(Detail, { label: t('record.method') }, translated(t, 'method', record.method, 'method.unknown')),
					(reason || record.status === 'failed') && h(Detail, { label: t('record.reason'), className: record.status === 'failed' ? 'sts-error-text' : '' }, reason || t('record.noReason')),
					h(Detail, { label: t('record.created') }, formatTime(record.createdAt, t)),
					h(Detail, { label: t('run.started') }, formatTime(record.startedAt, t)),
					h(Detail, { label: t('run.finished') }, record.finishedAt == null && ACTIVE_STATES.includes(record.status) ? t('run.inProgress') : formatTime(record.finishedAt, t))
				)
			);
		}

		function RecordsTable({ records, t }) {
			const [expanded, setExpanded] = useState(() => new Set());
			const toggle = (key) => setExpanded((prev) => {
				const next = new Set(prev);
				if (next.has(key)) next.delete(key); else next.add(key);
				return next;
			});
			const columns = ['status', 'session', 'old', 'new', 'model', 'method', 'reason', 'finished'];
			return h('div', { className: 'sts-table-wrap' },
				h('table', { className: 'sts-table' },
					h('thead', null, h('tr', null, ...columns.map((key) => h('th', { key, scope: 'col' }, t(`table.${key}`))))),
					h('tbody', null, ...records.slice().reverse().map((record, index) => {
						const key = `${record.sessionId || 'record'}-${record.startedAt || ''}-${index}`;
						const open = expanded.has(key);
						const reasonText = record.reason ? translated(t, 'reason', record.reason) : '';
						const finished = record.finishedAt == null && ACTIVE_STATES.includes(record.status)
							? t('run.inProgress') : formatTime(record.finishedAt, t);
						const rowProps = {
							className: open ? 'sts-row-open' : '',
							tabIndex: 0,
							'aria-expanded': open,
							'aria-label': t('table.expand'),
							onClick: () => toggle(key),
							onKeyDown: (event) => {
								if (event.key === 'Enter' || event.key === ' ' || event.code === 'Space') { event.preventDefault(); toggle(key); }
							}
						};
						return h(React.Fragment, { key },
							h('tr', rowProps,
								h('td', null, h(StatusBadge, { status: record.status, t })),
								h('td', { className: 'sts-nowrap', title: record.sessionId }, record.sessionId ? `…${String(record.sessionId).slice(-8)}` : t('empty.value')),
								h('td', { className: 'sts-trunc', title: record.oldTitle }, record.oldTitle || h('span', { className: 'sts-muted' }, t('record.untitled'))),
								h('td', { className: `sts-trunc${record.status === 'renamed' ? ' sts-success' : ''}`, title: record.newTitle }, record.newTitle || h('span', { className: 'sts-muted' }, t('record.noNewTitle'))),
								h('td', { className: 'sts-trunc' }, h(ModelValue, { record, t })),
								h('td', { className: 'sts-nowrap' }, translated(t, 'method', record.method, 'method.unknown')),
								h('td', { className: `sts-trunc${record.status === 'failed' ? ' sts-error-text' : ''}`, title: reasonText }, reasonText || (record.status === 'failed' ? h('span', { className: 'sts-muted' }, t('record.noReason')) : '')),
								h('td', { className: 'sts-nowrap' }, finished)
							),
							open && h('tr', { className: 'sts-detail-row' },
								h('td', { colSpan: columns.length },
									h('dl', null,
										h(Detail, { label: t('record.id') }, h('code', null, record.sessionId || t('empty.value'))),
										h(Detail, { label: t('record.created') }, formatTime(record.createdAt, t)),
										h(Detail, { label: t('run.started') }, formatTime(record.startedAt, t)),
										h(Detail, { label: t('run.finished') }, finished),
										h(Detail, { label: t('record.reason') }, reasonText || t('record.noReason'))
								)
								)
							)
						);
					}))
				)
			);
		}

		function Metrics({ report, t }) {
			return h('div', { className: 'sts-metrics' },
				...['discovered', 'considered', 'scanned', 'renamed', 'skipped', 'failed'].map((key) =>
					h('div', { className: 'sts-metric', key },
						h('strong', { className: key === 'failed' && report?.[key] > 0 ? 'sts-error-text' : '' }, typeof report?.[key] === 'number' ? report[key] : t('empty.value')),
						h('span', null, t(`metric.${key}`))
					)
				)
			);
		}

		function collectRuns(data) {
			const reports = [data?.lastReport, ...(Array.isArray(data?.history) ? data.history : [])];
			const unique = new Map();
			for (const report of reports) {
				if (!report || typeof report !== 'object') continue;
				const id = report.runId || `legacy-${report.startedAt || report.finishedAt || 'latest'}`;
				if (!unique.has(id)) unique.set(id, { ...report, runId: id });
			}
			return [...unique.values()].sort((a, b) => {
				const timestamp = (run) => new Date(run.startedAt || run.finishedAt || 0).getTime() || 0;
				return timestamp(b) - timestamp(a);
			}).slice(0, 10);
		}

		function RunHistory({ runs, selectedId, onSelect, t }) {
			if (runs.length === 0) return h('p', { className: 'sts-muted' }, t('run.emptyHistory'));
			return h(React.Fragment, null,
				h('p', { className: 'sts-muted' }, t('run.selectHint')),
				h('label', { className: 'sts-run-select' }, t('run.select'),
					h('select', { value: selectedId, onChange: (event) => onSelect(event.target.value) },
						h('option', { value: '' }, t('run.latest')),
						...runs.map((run) => h('option', { key: run.runId, value: run.runId },
							`${formatTime(run.startedAt, t)} · ${translated(t, 'source', run.source)} · ${translated(t, 'status', run.state, 'status.unknown')}`
						))
					)
				),
				h('ol', { className: 'sts-history' }, ...runs.map((run, index) =>
					h('li', { key: run.runId },
						h('button', {
							type: 'button', 'aria-pressed': selectedId ? selectedId === run.runId : index === 0,
							onClick: () => onSelect(run.runId)
						},
							`${formatTime(run.startedAt, t)} · ${translated(t, 'status', run.state, 'status.unknown')}`,
							h('small', null, `${translated(t, 'source', run.source)} · ${t('metric.scanned')} ${run.scanned ?? '—'} · ${t('metric.renamed')} ${run.renamed ?? '—'} · ${t('metric.failed')} ${run.failed ?? '—'}`)
						)
					)
				))
			);
		}

		function Records({ report, t }) {
			const [query, setQuery] = useState('');
			const [status, setStatus] = useState('');
			const records = Array.isArray(report?.records) ? report.records : [];
			const needle = query.trim().toLocaleLowerCase();
			const statuses = [...new Set(records.map((record) => record.status).filter(Boolean))];
			const filtered = records.filter((record) => {
				if (status && record.status !== status) return false;
				if (!needle) return true;
				return [record.sessionId, record.oldTitle, record.newTitle, record.provider, record.model,
					record.modelLabel, record.reason, record.method, translated(t, 'status', record.status),
					translated(t, 'reason', record.reason), translated(t, 'method', record.method)]
					.some((value) => value != null && String(value).toLocaleLowerCase().includes(needle));
			});

			return h('section', { className: 'sts-section' },
				h('h2', null, t('section.records')),
				report && h('dl', null,
					h(Detail, { label: t('run.id') }, h('code', null, report.runId)),
					h(Detail, { label: t('run.source') }, translated(t, 'source', report.source)),
					h(Detail, { label: t('run.started') }, formatTime(report.startedAt, t)),
					h(Detail, { label: t('run.finished') }, report.finishedAt == null && ACTIVE_STATES.includes(report.state) ? t('run.inProgress') : formatTime(report.finishedAt, t))
				),
				h(Metrics, { report, t }),
				h('div', { className: 'sts-filters' },
					h('label', null, t('filter.query'), h('input', {
						type: 'search', value: query, placeholder: t('filter.placeholder'),
						onChange: (event) => setQuery(event.target.value)
					})),
					h('label', null, t('filter.status'), h('select', {
						value: status, onChange: (event) => setStatus(event.target.value)
					}, h('option', { value: '' }, t('filter.all')),
						...statuses.map((value) => h('option', { key: value, value }, translated(t, 'status', value)))
					))
				),
				h('div', { className: 'sts-toolbar' },
					h('p', { className: 'sts-muted', role: 'status' }, `${t('record.count')}: ${filtered.length} / ${records.length}`),
					(query || status) && h('button', { type: 'button', onClick: () => { setQuery(''); setStatus(''); } }, t('filter.clear'))
				),
				records.length === 0 ? h('p', { className: 'sts-muted' }, t('record.empty'))
					: filtered.length === 0 ? h('p', { className: 'sts-muted' }, t('record.noMatch'))
						: h(RecordsTable, { records: filtered, t })
			);
		}

		function Categories({ data, t }) {
			const builtin = Array.isArray(data.builtin) ? data.builtin : [];
			const custom = Array.isArray(data.custom) ? data.custom : [];
			return h('section', { className: 'sts-section sts-categories' },
				h('div', null,
					h('h2', null, t('section.builtin')),
					h('div', { className: 'sts-chips' }, ...builtin.map((name) => h('span', { key: name, className: 'sts-badge' }, name)))
				),
				h('div', null,
					h('h2', null, t('section.custom')),
					custom.length === 0 ? h('p', { className: 'sts-muted' }, t('category.empty'))
						: h('div', null, ...custom.map((entry) => h('div', { className: 'sts-category-row', key: entry.name },
							h('span', null, entry.name),
							h('span', { className: 'sts-muted' }, `${entry.usage_count ?? 0} ${t('category.count')}`)
						)))
				)
			);
		}

		function ConfigTab({ status, t }) {
			const { data, refresh } = status;
			const override = data?.routeOverride;
			const [catalog, setCatalog] = useState(null);
			const [catalogError, setCatalogError] = useState(null);
			const [provider, setProvider] = useState(override?.provider ?? '');
			const [model, setModel] = useState(override?.model ?? '');
			const [busy, setBusy] = useState(false);
			const [message, setMessage] = useState(null);
			const [error, setError] = useState(null);
			// The live provider/model catalog comes from the Host's own LLM
			// registry — the same source the official model selector reads.
			const loadCatalog = useCallback(async () => {
				setCatalogError(null);
				try { setCatalog(await request('models', {})); }
				catch (e) { setCatalogError(String(e?.message ?? e)); }
			}, []);
			useEffect(() => { void loadCatalog(); }, [loadCatalog]);
			const groups = Array.isArray(catalog?.groups) ? catalog.groups : [];
			const providerGroup = groups.find((group) => group.id === provider) ?? null;
			// Only models of the selected provider are ever offered; a stale
			// saved model that the provider no longer lists is surfaced, not hidden.
			const models = providerGroup?.models ?? [];
			const modelKnown = models.some((entry) => entry.id === model);
			const save = async (next) => {
				setBusy(true); setError(null); setMessage(null);
				try {
					const body = next ? { provider: next.provider, model: next.model } : { provider: '', model: '' };
					await request('config', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) });
					if (next) { setProvider(next.provider); setModel(next.model); } else { setProvider(''); setModel(''); }
					setMessage(next ? t('config.saved') : t('config.cleared'));
					await refresh();
				} catch (e) { setError(String(e?.message ?? e)); }
				finally { setBusy(false); }
			};
			const onPickProvider = (id) => {
				setProvider(id);
				// Switching providers invalidates any model choice from the old one.
				setModel('');
				setMessage(null);
			};
			const complete = provider !== '' && model !== '' && modelKnown;
			return h('section', { className: 'sts-section' },
				h('h2', null, t('section.config')),
				h('div', { className: 'sts-notice' },
					h('p', { className: 'sts-muted' }, t('config.hint'))
				),
				h('p', null, `${t('config.current')}: `, override
					? h('code', null, `${override.provider} / ${override.model}`)
					: h('span', { className: 'sts-muted' }, t('config.none'))),
				catalogError && h('div', { className: 'sts-notice sts-error', role: 'alert' },
					h('p', { className: 'sts-error-text' }, `${t('config.modelsError')}: ${catalogError}`),
					h('button', { type: 'button', onClick: () => { void loadCatalog(); } }, t('action.retry'))
				),
				!catalog && !catalogError && h('p', { className: 'sts-muted', role: 'status' }, t('config.loadingModels')),
				groups.length > 0 && h('div', { className: 'sts-filters' },
					h('label', null, t('config.provider'),
						h('select', { value: provider, onChange: (e) => onPickProvider(e.target.value), disabled: busy },
							h('option', { value: '' }, t('config.pickProvider')),
							...groups.map((group) => h('option', { key: group.id, value: group.id },
								`${group.name}${group.models.length === 0 && group.error ? `（${t('config.providerFailed')}）` : ''}`))
						)),
					h('label', null, t('config.model'),
						h('select', { value: modelKnown ? model : '', onChange: (e) => setModel(e.target.value), disabled: busy || provider === '' },
							h('option', { value: '' }, provider === '' ? t('config.pickProviderFirst') : t('config.pickModel')),
							...models.map((entry) => h('option', { key: entry.id, value: entry.id }, entry.name === entry.id ? entry.id : `${entry.name} (${entry.id})`))
						))
				),
				provider !== '' && model !== '' && !modelKnown && h('p', { className: 'sts-error-text', role: 'alert' }, t('config.modelNotInProvider')),
				h('div', { className: 'sts-toolbar' },
					h('div', { className: 'sts-actions' },
						h('button', { className: 'sts-primary', type: 'button', disabled: busy || !complete, onClick: () => { void save({ provider, model }); } }, busy ? t('busy') : t('config.save')),
						h('button', { type: 'button', disabled: busy || !override, onClick: () => { void save(null); } }, t('config.clear')),
						catalog && h('button', { type: 'button', disabled: busy, onClick: () => { void loadCatalog(); } }, t('config.reload'))
					)
				),
				message && h('p', { className: 'sts-success', role: 'status' }, message),
				error && h('div', { className: 'sts-notice sts-error', role: 'alert' }, `${t('action.failure')}: ${error}`)
			);
		}

		function PanelPage({ t }) {
			const status = useStatus();
			const { data, loadError, actionError, refreshing, posting, syncedAt } = status;
			const [tab, setTab] = useState('records');
			const [selectedId, setSelectedId] = useState('');
			const runs = collectRuns(data);
			const report = runs.find((run) => run.runId === selectedId) || runs[0] || null;
			const hostError = data?.error;
			const isRunning = data?.running === true;
			const unknown = !data || !!loadError;
			const scanDisabled = unknown || isRunning || posting;
			const heading = loadError ? t('connection.error') : !data ? t('run.unknown')
				: posting ? t('action.pending') : isRunning ? t('run.running')
					: hostError || actionError ? t('run.error') : t('run.idle');

			useEffect(() => {
				if (selectedId && !runs.some((run) => run.runId === selectedId)) setSelectedId('');
			}, [selectedId, runs.map((run) => run.runId).join('|')]);

			return h('div', { className: 'session-title-summary', 'data-dsh-panel': PANEL_ID },
				h('style', null, CSS),
				h('header', { className: 'sts-header' },
					h('h1', null, t('panel.title')),
					h('p', { className: 'sts-muted' }, t('panel.subtitle'))
				),
				h('div', { className: 'sts-tabs', role: 'tablist' },
					h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'records', className: tab === 'records' ? 'sts-tab-active' : '', onClick: () => setTab('records') }, t('tab.records')),
					h('button', { type: 'button', role: 'tab', 'aria-selected': tab === 'config', className: tab === 'config' ? 'sts-tab-active' : '', onClick: () => setTab('config') }, t('tab.config'))
			),
				tab === 'config' ? h(ConfigTab, { status, t }) : h(React.Fragment, null,
				h('section', { className: 'sts-section', 'aria-busy': !data && refreshing },
					h('h2', null, t('section.backfill')),
					h('div', { className: 'sts-toolbar' },
						h('strong', { role: 'status', 'aria-live': 'polite', className: loadError || hostError || actionError ? 'sts-error-text' : '' }, heading),
						h('div', { className: 'sts-actions' },
							h('button', { type: 'button', disabled: refreshing, onClick: () => { void status.refresh(); } }, refreshing ? t('action.refreshing') : t('action.retry')),
							h('button', { className: 'sts-primary', type: 'button', disabled: scanDisabled, onClick: () => { void status.scan(); } }, posting ? t('action.pending') : t('action.scan'))
						)
					),
					!data && !loadError && h('p', { role: 'status', className: 'sts-muted' }, t('connection.loading')),
					loadError && h('div', { className: 'sts-notice sts-error', role: 'alert' },
						h('p', { className: 'sts-error-text' }, errorMessage(loadError, t)),
						data && h('p', { className: 'sts-muted' }, t('connection.stale'))
					),
					actionError && h('div', { className: 'sts-notice sts-error', role: 'alert' }, `${t('action.failure')}: ${errorMessage(actionError, t)}`),
					hostError && h('div', { className: 'sts-notice sts-error', role: 'alert' }, `${t('run.error')}: ${errorMessage(hostError, t)}`),
					h('div', { className: 'sts-meta sts-muted' },
						h('span', null, t('connection.poll')),
						syncedAt && h('span', null, `${t('connection.synced')}: ${formatTime(syncedAt, t)}`),
						data?.version && h('span', null, `${t('panel.version')}: ${data.version}`)
					),
					data && h('p', { className: 'sts-muted' }, `${t('run.last')}: ${data.lastRunAt == null ? t('run.never') : formatTime(data.lastRunAt, t)}`),
					data && h(Metrics, { report: data.lastReport, t }),
					(data?.current || isRunning) && h('div', { className: 'sts-current' },
						h('h3', null, t('section.current')),
						data.current ? h(RecordCard, { record: data.current, t }) : h('p', { className: 'sts-muted', role: 'status' }, t('record.noCurrent'))
					)
				),
				data && h('section', { className: 'sts-section' },
					h('h2', null, t('section.history')),
					h(RunHistory, { runs, selectedId, onSelect: setSelectedId, t })
				),
				data && h(Records, { report, t }),
				data && h(Categories, { data, t })
				)
			);
		}

		return {
			inject: ['slots', 'locale'],
			apply(ctx) {
				let t = (key) => DICTS.zh[key] ?? key;
				try {
					ctx.effect(() => ctx.locale.register(NS, DICTS));
					t = ctx.locale.bind(NS);
				} catch { /* Keep the localized Chinese fallback if locale is unavailable. */ }
				const slots = ctx.slots;
				const disposers = [
					slots.inject('sidebar.panellist', () => slots.register({
						name: 'sidebar.panellist', id: PANEL_ID, order: 25,
						label: () => t('entry.label')
					}, PanelIcon)),
					slots.inject('main', () => slots.register({
						name: 'main', key: PANEL_ID
					}, () => h(PanelPage, { t })))
				];
				ctx.effect(() => () => {
					for (const dispose of disposers.splice(0)) dispose();
				}, 'session-title-summary: panel slots');
			}
		};
	}
});
