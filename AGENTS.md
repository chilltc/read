# AGENTS.md — 给 AI 助手的项目说明

这是 Changgeng 的移动阅读器 + 个性化读书系统。两条核心指令：

## 解析1 = 入库（把书转成可读数据）

用户说 **「解析1 X」「加本新书」「帮我解析这本书」「重新处理一下 X」**（书还没在书架里）时：

→ 让用户把文件丢进 `books/`（PDF/txt/md/mobi；epub 先用 pandoc/calibre 转 txt/md），
然后跑 `python3 scripts/ingest.py`（自动发现+登记+解析，txt 会重新排版）。

## 解析2 = 解读（映射到用户的人生经历）

用户说 **「解析2 X」「解读 X」「给《X》做个性化映射」**（书已在书架里）时：

→ **完整读 `brain/HOW-TO-GENERATE.md`，严格按它的 8 步执行。**
那份文档是脑内映射流程的**单一事实来源**（切章 → 每章独立检索用户经历 → 事实校验 →
写 `brain-data.js` + `brain/<id>.md` → 锚点校验）。不要凭记忆做，以文档为准。

## 智能区分

用户只说「解析 X / 帮我处理 X」没带数字时：先查 `ebook-data.js` 有没有这本书——
没有当解析1，有了当解析2，拿不准就问。

## 上线

用户说 **「上线 / 提交」** → git add 网站文件并 commit、push 到 `origin main`（GitHub Pages 自动发布）。

## 整体架构

详见 `ARCHITECTURE.md`。一句话：`books/`（丢书）→ `ingest.py`（解析1，转可读数据）→
`ebook-data.js` → 阅读器渲染；解析2 读 `ebook-data.js` + `Blog/wiki/`（用户人生语料库）→
写 `brain-data.js`（阅读器读取）。

## 铁律

- **解析2 只写 `brain-data.js` 和 `brain/*.md`，绝不改 `ebook-data.js`**（那是解析1 的产物）。
- 用户画像和事实**从 `/Users/changgeng/Documents/Blog/wiki/` 读取**，不假设、不编造。
  ⚠️ Garry Tan 文章里的「移民家庭 / 运营 YC」是**他本人**的，不是本用户的。本用户是
  产品经理出身、做过知识星球、2025 转自由职业，核心矛盾「能发现机会无法建立壁垒」。
- 隐私：解读转述用户经历为主，少量短引可，原始日记永远留在 `Blog`、不复制进 `read`。
