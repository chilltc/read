# AGENTS.md — 给 AI 助手的项目说明

这是 Changgeng 的移动阅读器 + **书镜 / Brain Page** 个性化读书系统。

## 快捷指令

当用户说 **「书镜 X」「生成脑页 X」「book mirror X」「给《X》做个性化映射」** 时：

→ **完整读 `brain/HOW-TO-GENERATE.md`，然后严格按它的 8 步执行。**

那份文档是脑页生成流程的**单一事实来源**（切章 → 每章独立检索用户经历 → 事实校验 →
写 `brain-data.js` + `brain/<id>.md` → 锚点校验）。不要凭记忆做，以文档为准。

当用户说 **「加书 X」「我放了本书」** 时：

→ 让用户把文件丢进 `books/`，然后跑 `python3 scripts/ingest.py`（自动登记+解析）。

当用户说 **「上线 / 提交」** 时：

→ `git add` 网站文件并 commit、push 到 `origin main`（GitHub Pages 自动发布）。

## 整体架构

详见 `ARCHITECTURE.md`。一句话：`books/`（丢书）→ `ingest.py`（解析）→ `ebook-data.js`
（原书）→ 阅读器渲染；脑页流程读 `ebook-data.js` + `Blog/wiki/`（用户人生语料库）→
写 `brain-data.js`（阅读器读取）。

## 铁律

- **只写 `brain-data.js` 和 `brain/*.md`，绝不改 `ebook-data.js`**（书源由 ingest 管）。
- 用户画像和事实**从 `/Users/changgeng/Documents/Blog/wiki/` 读取**，不假设、不编造。
  ⚠️ Garry Tan 文章里的「移民家庭 / 运营 YC」是**他本人**的，不是本用户的。本用户是
  产品经理出身、做过知识星球、2025 转自由职业，核心矛盾「能发现机会无法建立壁垒」。
- 隐私：脑页转述用户经历为主，少量短引可，原始日记永远留在 `Blog`、不复制进 `read`。
