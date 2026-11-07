# session-title-summary

[中文说明](#中文说明) · [English](#english)

A community plugin for [DeepSeek Harness (DSH)](https://github.com/deepseek-ai/deepseek-harness) that renames sessions with categorized, rule-checked titles in the `MMDD | 分类 | 主题` format, backfills history sessions, and provides a management panel in the DSH Web UI.

## English

### What it does

- **Automatic titles**: registers the sole optional `ctx.sessionTitle` provider and generates a title after each human message (or the first message only, configurable). Titles follow the `MMDD | Category | Topic` format, falling back to `MMDD | Short title` when confidence is low.
- **Categories**: builtin categories (功能/设计/整改/优化/发布/分析/文档) plus a dynamic ledger — model-invented category words are kept, counted, and normalized through a synonym table. Sensitive content (credentials, paths) is scrubbed and never reaches the model or a title.
- **History backfill**: on activation, scans persisted sessions (newest first, bounded batch) and renames every nonconforming title through the same pipeline — including manually renamed and currently-open sessions. Conforming titles are final and skipped.
- **Web panel**: a sidebar panel with live scan progress, per-session records (old/new title, actual model called, skip reasons), run history, category statistics, and a model-configuration tab that pulls the provider/model catalog from the running DSH instance and can pin a fixed title model.

### Install

Requires DSH with plugin management. Either:

1. Clone this repo and, in DSH, install the local directory as a bundle (`plugin_manager install_bundle` with the absolute path), or
2. Install from the community plugin index ("Discover" tab) once listed.

The bundle patch disables the shipped `optional-session-title-all-prompts` and `session-title-llm` rows because `ctx.sessionTitle.register()` is a single slot; those overrides are idempotent and harmless elsewhere.

### Configuration

All knobs live in `cordis.patch.yml` under the `session-title-summary` row: cadence (`all-prompts` / `first-prompt`), builtin & seed custom categories, synonym mappings, local fast-path keywords, confidence threshold, topic length, message window, input/output budgets, timeout, and backfill bounds. An optional fixed title model (provider+model pair) can be pinned from the panel and persists in `~/.dsh/session-title-summary/settings.json`.

### Tests

`node --test test-monitor.mjs` (13 integration-style tests) and `node test-pure.mjs` (pure pipeline checks) must pass before any release.

## 中文说明

### 功能

- **自动命名**：注册 `ctx.sessionTitle` 唯一标题提供方，每条人类消息后（或仅首条，可配置）生成 `MMDD | 分类 | 主题` 格式标题；置信度不足时回退 `MMDD | 简短标题`。
- **分类体系**：内置分类 + 动态分类账本（模型发明的新分类词被保留、计数并经同义表归并）；凭据、路径等敏感内容一律脱敏，不会进入模型输入或标题。
- **历史回填**：激活时扫描持久化会话（从新到旧、有批量上限），所有不合规标题经同一管线重命名——包括手动命名和打开中的会话；已合规标题视为完成并跳过。
- **管理面板**：侧边栏面板实时显示扫描进度、逐会话处理记录（原标题/新标题/实际调用模型/跳过原因）、历史运行与分类统计；模型配置页从当前 DSH 实例拉取供应商与模型目录，可固定统一标题模型。

### 安装

方式一：克隆本仓库后，在 DSH 中用插件管理器将该目录作为 bundle 安装（`plugin_manager install_bundle` 传绝对路径）；方式二：待社区插件索引（"发现"页）收录后直接安装。

bundle 会禁用内置 `optional-session-title-all-prompts` 与 `session-title-llm` 两行（`ctx.sessionTitle.register()` 为单槽），覆盖为幂等写法，在别处无害。

### 配置

所有可调项都在 `cordis.patch.yml` 的 `session-title-summary` 行：分析时机、内置与种子分类、同义归并、本地快速通道关键词、置信度阈值、主题长度、消息窗口、输入输出预算、超时与回填上限。可在面板固定统一标题模型（provider+model 成对），持久化于 `~/.dsh/session-title-summary/settings.json`。

### 测试

发布前必须通过 `node --test test-monitor.mjs`（13 项）与 `node test-pure.mjs`（纯函数检查）。

## License

AGPL-3.0 — see [LICENSE](./LICENSE).
