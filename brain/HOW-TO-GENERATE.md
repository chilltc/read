# 如何生成一本书的个性化解读（「解析2」）

> 这是**中立流程文档**：不绑定任何具体 AI。Claude、Codex、Cursor 或任何能读文件、
> 跑命令的 AI 助手，读完这份就能照着给一本书生成个性化解读。
>
> 术语：**解析1** = 把书转成可读数据（见文末「加新书」）；**解析2** = 本文档讲的、
> 把书的观点映射到用户人生经历。（Claude Code 用户：`解析` 技能只是指向这份文档的薄封装。
> 真正的流程以本文件为准——**单一事实来源**，改流程只改这里。）

## 这是什么

「书镜 / Brain Page」= 把一本书每章的观点，缝进书主人 **Changgeng** 的真实人生经历，
作为可折叠块穿插显示在阅读器正文里（保留原文，旁边加"我的故事"）。
灵感来自 Garry Tan 的 book-mirror。

## 两个数据源（都在本机）

- **书源**：`read/ebook-data.js` —— `window.EBOOK_DATA.documents[]`，每本书有
  `id` 和 `blocks`（heading/paragraph/qa/figures）。已由 `scripts/ingest.py` 解析好。
- **人生语料库**：`/Users/changgeng/Documents/Blog/wiki/` —— 397 篇日记的结构化 Wiki：
  - `index.md` 导航 → `themes/`（career/business/growth/mindset/life/goals）、
    `timeline/`（按年份）、`people.md`、`insights.md`（跨年高价值洞察）。
  - 原始日记在 `Blog/01.年度记录/`，**只在需要具体细节时**才下钻。

## 产出（两路）

1. `read/brain-data.js` —— 阅读器读取（`window.BRAIN_DATA`，schema 见该文件顶部注释）。
2. `read/brain/<book-id>.md` —— 人类可读源，便于精读 / 迭代 / 交接。

---

## 书主人画像（映射的依据）

> ⚠️ **必须从 `Blog/wiki/` 实时读取，不要凭空假设、不要套用别人的背景。**
> 特别注意：Garry Tan 文章里的「移民家庭 / 运营 YC」是**他本人**的，**不是 Changgeng 的**。
> 下面是稳定主线，细节以 wiki 当前内容为准。

- **职业主线**：产品经理出身，做过**知识星球**功能开发（2021-2022）。核心命题
  「深度思考 + 主人翁精神」。反复觉察：「传声筒陷阱」「联想能力是核心差异化」
  「理解业务是护城河」（王盐点醒）「不要屎上雕花」。
- **轨迹**：2019 入行 → 2021-22 知识星球 → 2023-24 深耕 + 多次跳槽未成 →
  2025 离职转自由职业 / AI 产品 / 公众号 / 出海。
- **核心矛盾（高预测价值）**：「能发现机会，无法建立壁垒」；「兴趣=数据增长，停增则失兴趣」；
  「平台型能力 ≠ 建平台能力」；「计划 > 执行」；「先想清楚 vs 先做」。
- **稳定价值观**：自律才是真正的自由（2018 确立至今）。

## 隐私铁律

- `note`/`recap` 默认**转述**经历，不逐字搬日记。
- 可**少量、短句**直引日记原文（几句内），但**不大规模复制原文**。
- 原始日记永远留在 `Blog`，不复制进 `read`。
- 生成后做隐私扫描（第 5 步）。

---

## 工作流（8 步）

### 1. 定位书、切章

读 `read/ebook-data.js`，确认目标书 `id`，按 `type:"heading"` 把 `blocks` 切成章节
（每章 = 一个 heading + 其后到下一个同级/更高级 heading 之前的所有 block）。
记录每章：标题、起止 block、几个段落开头原文（供 afterText 锚点）。
> 提示：若书很长、章节很多，可只取顶层（depth 1）heading 作为「章」单位，避免一次几十个子任务。

### 2. 读语料库索引（只做一次）

读 `Blog/wiki/index.md`（+ `Blog/wiki/CLAUDE.md`）了解结构。**不要**把所有日记读进主上下文。

### 3. 每章独立处理 ⭐（核心：互不污染上下文）

**对每一章，开一个独立的子任务/子智能体**，各自去 wiki 检索，主上下文不堆全书素材。
- Claude Code：用 Agent 工具，`subagent_type: general-purpose`，多章一条消息并行发。
- Codex / 其他：用各自的子代理 / 并行机制；没有就**逐章串行**处理，每章处理完清掉该章素材
  再做下一章，效果等价（只是慢些）。

给每个子任务的输入必须含：书主人画像 + 隐私铁律 + 本章作者要点 + 几个 afterText 锚点原文 +
检索指令（先读 `wiki/index.md` 定位 → 相关 `themes/*`、`timeline/*`、`people.md`、
`insights.md`；需要细节才下钻 `01.年度记录/`）。

每章输出契约（JSON）：
```json
{
  "coreIdea": "作者核心思想（1-2 句）",
  "inline": [
    { "afterText": "本章某段落开头原文（原样照抄，做锚点）",
      "note": "这让我想起……（具体映射，转述为主，可含少量短引文）",
      "ref": "themes/career 或 timeline/2025-2026 等来源" }
  ],
  "recap": "这一章整体如何对应我此刻的人生（2-4 句，第一人称'我'）",
  "ref": "themes/career"
}
```
要求：映射**具体落地**到真实经历，不要「这对管理者颇有启发」式空泛套话。
每章 2-3 条 inline，挑最扎实的。

### 4. 事实校验（强制）⚠️

汇总所有章节后，**用一个独立视角校验事实**——最好是另一个模型：
- Claude Code：调 `/codex`（consult 模式）。
- 其他环境：换一个模型，或至少另起一个干净上下文复核。

校验重点（针对 Changgeng 的真实背景，**不是** Garry 的）：
- 职业事实有没有写错：产品经理、知识星球、自由职业/AI产品/公众号、跳槽多次未成。
- 有没有把 wiki 里**不存在**的经历、项目、人物**编**出来。
- 具体数字/项目名是否属实（可回 `wiki/themes/business.md` 等核对）。

**校验不过不写盘。** 按反馈修正。

### 5. 隐私扫描

逐条检查 `note`/`recap`：有没有大段照搬日记原文？直引是否控制在几句短句内？超标改成转述。

### 6. 写盘（两路）

**A. `read/brain-data.js`**：合并到 `window.BRAIN_DATA["<book-id>"]`，**保留其他书**
（先读现有文件，合并，再整体写回）。结构：
```js
window.BRAIN_DATA["<book-id>"] = {
  generatedAt: "YYYY-MM-DD",
  sourceCorpus: "wiki@<wiki/index.md 的 last_updated 日期>",
  inline: [ /* 所有章节 inline 汇总 */ ],
  chapters: [ { anchorTitle, coreIdea, recap, ref } /* 每章一条 */ ]
};
```
- `afterText` 必须是 ebook-data 里**真实存在**的段落开头（照抄，别自创）。
- `anchorTitle` 必须等于该章 heading 的 text。

**B. `read/brain/<book-id>.md`**：人类可读全文（每章：作者核心 / 逐条映射 / 章末小结 / 来源）。

### 7. 校验锚点 + 渲染

写盘后**务必跑一遍锚点校验**（这是最容易出错的地方——子智能体可能自创不存在的锚点）：
```bash
cd read && node -e '
global.window={}; require("./ebook-data.js"); require("./brain-data.js");
const core=require("./reader-core.js");
const id="<book-id>";
const doc=window.EBOOK_DATA.documents.find(d=>d.id===id);
const bd=window.BRAIN_DATA[id];
const p=core.resolveBrainPlacements(bd,doc.blocks);
const m=[...p.inlineByIndex.values()].reduce((a,v)=>a+v.length,0);
console.log("inline:",bd.inline.length,"matched:",m,"| chapters:",bd.chapters.length,"recaps:",p.recapByIndex.size);
'
```
`matched` 应等于 `inline` 数、`recaps` 应等于 `chapters` 数。对不上的说明 afterText/anchorTitle
没命中——回去把它改成 ebook-data 里真实存在的文本。

### 8. 看效果

```bash
cd read && python3 -m http.server 8081      # 打开对应书
```
确认正文出现内联「🪞 我的」可折叠块 + 章末「🪞 写给我自己」小结，四主题正常、不打断阅读。

---

## 关键不变量（任何 AI 都要守）

1. **只写 `brain-data.js` 和 `brain/*.md`，绝不改 `ebook-data.js`**（书源由 ingest 管）。
2. 用**章节标题 / 段落开头文本**做锚点，不依赖 block index（重建书后仍对得上）。
3. 每章独立上下文，不被全书素材污染。
4. 画像与事实从 wiki 读，不假设、不套别人背景、不编造。
5. 隐私：转述为主，原文留 Blog。

## 加新书（前置步骤 = 解析1）

把书丢进 `read/books/`，跑 `python3 scripts/ingest.py`（自动发现新文件、登记、解析）。
- 支持 PDF / txt / md；txt 会被重新分段排版。
- **epub / mobi**：当前 ingest 走文本抽取，先用 `pandoc`（epub→md）或 calibre 的
  `ebook-convert` 转成 txt/md，再丢进 `books/`。
- 入库后才能做解析2（个性化解读）。详见 `read/ARCHITECTURE.md`。
