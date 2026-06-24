# 架构说明 / ARCHITECTURE

移动端电子书阅读器 + 个性化读书系统。
本文件是给人和 AI 看的全局地图——接手前先读这一页。

## 这是什么

两条核心动作：
1. **解析1（入库）**：把任何格式的书（PDF/epub/mobi/txt）转成阅读器能读的、排版好的数据。
2. **解析2（解读）**：把每本书的观点映射到主人（Changgeng）的真实人生经历，作为可折叠块
   **穿插在正文里**，越读越懂自己。灵感来自 Garry Tan 的 book-mirror。

## 数据流

```
   books/<书>.pdf|txt|md  +  books/manifest.json
            │
            │  python3 scripts/ingest.py     （通用解析，零 pip 依赖，用 pdftotext）
            ▼
       ebook-data.js   (window.EBOOK_DATA)   ← 原书内容
            │
            │           ┌─────────────────────────────────────────┐
            │           │  brain-page 技能（~/.claude/skills/）      │
            │           │  读 ebook-data 切章 → 每章独立子智能体      │
            │           │  从 Blog/wiki 检索 → /codex 事实校验        │
            │           └─────────────────────────────────────────┘
            │                          │
            ▼                          ▼
   index.html ← app.js ← brain-data.js (window.BRAIN_DATA)  ← 脑页（个人映射）
                  │                    + brain/<id>.md（可读源）
                  ▼
            reader-core.js（纯函数，可单测）
```

**核心原则：原书内容（ebook-data.js）与脑页（brain-data.js）物理分离。**
重建书本不会覆盖脑页；脑页用「章节标题 / 段落开头文本」做锚点，不依赖 block index，
所以重建后只要文字不变就仍能对上。

## 文件职责

| 文件 | 职责 |
|---|---|
| `books/` | 拖书进来的入口。放 PDF/TXT/MD 即可——`ingest.py` 会自动登记到 manifest |
| `books/manifest.json` | 书架清单：每本书的 id/标题/副标题/分类/源文件路径（顶部有 schema 注释）。新文件自动追加，可手动改 title 等 |
| `scripts/ingest.py` | **通用** ingest：扫描 `books/` 自动发现新文件并登记，解析成 `ebook-data.js`。一条命令重建整个书架 |
| `ebook-data.js` | 原书数据 `window.EBOOK_DATA = {libraryTitle, documents:[{id,title,blocks,outline,...}]}`。由 ingest 生成，勿手改 |
| `brain-data.js` | 脑页数据 `window.BRAIN_DATA`。顶部有完整 schema 注释。由 brain-page 流程生成，也可手改 |
| `brain/HOW-TO-GENERATE.md` | **中立流程文档**：脑页生成的单一事实来源，任何 AI（Claude/Codex/Cursor）读了能照做 |
| `brain/<id>.md` | 脑页的人类可读源，便于精读 / 迭代 / 交给别的 AI |
| `index.html` | DOM 骨架。按顺序加载 ebook-data → brain-data → reader-core → app |
| `app.js` | 主逻辑：渲染、进度、主题、目录。`renderBook()` 注入脑页块；脑页折叠交互在 reader 的 click 委托里 |
| `reader-core.js` | 纯函数（无 DOM），含 `resolveBrainPlacements()` 锚点匹配逻辑。**有单测** |
| `styles.css` | 样式。脑页样式 `.brain-inline` / `.brain-recap` / `.brain-toggle` 用 CSS 变量适配四主题 |
| `tests/reader-core.test.js` | reader-core 单元测试（含脑页锚点匹配） |
| `scripts/build_ebook.py`, `build_library.py` | **旧脚本**，已被 ingest.py 取代，保留备份 |

## block 结构（ebook-data 的 documents[].blocks）

```
{type:"heading", depth:1|2|3, text, page}
{type:"paragraph", text, page}
{type:"qa", text, page}        // Q:/A: 开头
{type:"figures", page, images:[{src,alt,width,height}]}
```

## brain-data 结构（摘要，完整版见 brain-data.js 顶部注释）

```js
window.BRAIN_DATA["<book-id>"] = {
  generatedAt, sourceCorpus,
  inline:   [{ afterText, note, ref }],   // 段落后就近插入的小映射（折叠）
  chapters: [{ anchorTitle, coreIdea, recap, ref }]  // 章末整合小结
}
```
- `afterText` 模糊匹配某段落开头（忽略空白/大小写），命中则插在该段之后。
- `anchorTitle` 匹配某 heading，`recap` 插在该章末尾。
- 匹配逻辑：`reader-core.js` 的 `resolveBrainPlacements()`。

## 常用命令

```bash
# 解析1（入库）：把书丢进 books/，然后跑（自动发现+登记+解析）：
python3 scripts/ingest.py

# 解析2（解读）：在 Claude Code/Codex 里对某本书说「解析2 X」/「解读 X」

# 本地预览
python3 -m http.server 8081      # 打开 http://localhost:8081

# 测试 + 语法检查
npm run check                     # node --check + 单测
```

## 隐私边界（重要）

- 原始日记 (`Blog/01.年度记录/`) **永远留在 Blog**，不复制进 read。
- 脑页 `note`/`recap` 默认**转述**经历；可少量短句直引日记，但**不大规模上传原文**。
- `read` 是公开仓库（GitHub Pages）；`brain-data.js` 可提交，但内容须符合上面的转述原则。
- brain-page 技能第 4 步用 `/codex` 校验家庭/职业事实，第 5 步做隐私扫描。

## 加新书（前置步骤）

把 PDF/txt/md 丢进 `read/books/`，跑 `python3 scripts/ingest.py`（会**自动发现**新文件、
登记到 manifest 并解析）。然后才能对这本书生成脑页。详见 `read/ARCHITECTURE.md`。

## 给接手的 AI

- 改阅读器渲染 → 看 `app.js renderBook()` + `reader-core.js`，改完跑 `npm run check`。
- **生成脑页 → 读 `brain/HOW-TO-GENERATE.md`**（中立流程，不绑定任何 AI；Claude Code 的
  `~/.claude/skills/brain-page/SKILL.md` 只是指向它的薄封装）。
- 加书解析能力 → 看 `scripts/ingest.py`（标题识别在 `guess_heading_depth`，自动发现在 `discover_and_register`）。
- 人生语料库的结构 → 看 `Blog/wiki/CLAUDE.md` 和 `index.md`。
