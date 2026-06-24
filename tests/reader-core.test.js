const test = require("node:test");
const assert = require("node:assert/strict");

const core = require("../reader-core.js");

test("clampSettings keeps reader preferences inside comfortable mobile ranges", () => {
  assert.deepEqual(
    core.clampSettings({
      theme: "unknown",
      fontSize: 99,
      lineHeight: 0.5,
      width: 80,
      controlsMode: "bad",
    }),
    {
      theme: "green",
      fontSize: 24,
      lineHeight: 1.55,
      width: 44,
      controlsMode: "auto",
    }
  );

  assert.deepEqual(
    core.clampSettings({}),
    {
      theme: "green",
      fontSize: 17,
      lineHeight: 1.82,
      width: 39,
      controlsMode: "auto",
    }
  );

  assert.deepEqual(
    core.clampSettings({
      theme: "night",
      fontSize: 12,
      lineHeight: 3,
      width: 12,
      controlsMode: "always",
    }),
    {
      theme: "night",
      fontSize: 15,
      lineHeight: 2.15,
      width: 34,
      controlsMode: "always",
    }
  );
});

test("resolveEffectiveTheme follows system dark mode only when theme is auto", () => {
  assert.equal(core.resolveEffectiveTheme("auto", true), "night");
  assert.equal(core.resolveEffectiveTheme("auto", false), "green");
  assert.equal(core.resolveEffectiveTheme("paper", true), "paper");
  assert.equal(core.resolveEffectiveTheme("night", false), "night");
});

test("findActiveHeading picks the latest heading above the reading offset", () => {
  const headings = [
    { id: "intro", top: 120, title: "前言", page: "2" },
    { id: "scale", top: 640, title: "规模效应", page: "10" },
    { id: "needs", top: 1320, title: "需求", page: "40" },
  ];

  assert.equal(core.findActiveHeading(headings, 80, 110).id, "intro");
  assert.equal(core.findActiveHeading(headings, 700, 110).id, "scale");
  assert.equal(core.findActiveHeading(headings, 2000, 110).id, "needs");
});

test("findChapterTarget returns next and previous chapter targets around the viewport", () => {
  const headings = [
    { id: "a", top: 100 },
    { id: "b", top: 500 },
    { id: "c", top: 900 },
  ];

  assert.equal(core.findChapterTarget(headings, 120, 1).id, "b");
  assert.equal(core.findChapterTarget(headings, 520, 1).id, "c");
  assert.equal(core.findChapterTarget(headings, 520, -1).id, "a");
  assert.equal(core.findChapterTarget(headings, 30, -1).id, "a");
});

test("resolveTocTarget matches outline entries to reflowed heading ids instead of loose page positions", () => {
  const headings = [
    { id: "intro", page: 2, depth: 1, title: "前言" },
    { id: "iphone", page: 2, depth: 3, title: "1. iPhone vs. 诺基亚" },
    { id: "strategy", page: 8, depth: 1, title: "战略" },
    { id: "market", page: 8, depth: 2, title: "一、市场体量" },
  ];

  assert.equal(core.resolveTocTarget({ title: "二、战略", page: 8, level: 1 }, headings), "strategy");
  assert.equal(core.resolveTocTarget({ title: "1、市场体量", page: 8, level: 2 }, headings), "market");
});

test("normalizeLibrary supports both old single-document data and the new multi-document shelf", () => {
  const single = { title: "王慧文清华产品课", blocks: [] };
  assert.deepEqual(core.normalizeLibrary(single).documents.map((document) => document.id), [
    "qinghua-product-course",
  ]);

  const library = {
    documents: [
      { id: "a", title: "A", blocks: [] },
      { title: "B", blocks: [] },
    ],
  };
  assert.deepEqual(core.normalizeLibrary(library).documents.map((document) => document.id), ["a", "b"]);
});

test("documentStateKey namespaces reading progress per document", () => {
  assert.equal(
    core.documentStateKey("qinghua-product-ebook:v2", "token-capital-report"),
    "qinghua-product-ebook:v2:token-capital-report"
  );
});

test("resolveBrainPlacements anchors inline notes to paragraphs and recaps to chapter ends", () => {
  const blocks = [
    { type: "heading", depth: 1, text: "一、成功和失败的产品" },
    { type: "paragraph", text: "一般来说在一个领域里一款产品的成功对应着无数失败。" },
    { type: "paragraph", text: "举个例子，iPhone 取代了诺基亚。" },
    { type: "heading", depth: 1, text: "二、战略" },
    { type: "paragraph", text: "战略的本质是取舍。" },
  ];
  const brainDoc = {
    inline: [
      // 匹配忽略空白，开头模糊匹配
      { afterText: "一般来说在一个领域里", note: "我的体会" },
      { afterText: "不存在的段落开头", note: "不该命中" },
    ],
    chapters: [
      { anchorTitle: "一、成功和失败的产品", recap: "第一章小结" },
      { anchorTitle: "二、战略", recap: "第二章小结" },
    ],
  };

  const placements = core.resolveBrainPlacements(brainDoc, blocks);

  // inline 命中第 1 个 block（段落），未命中的不产生条目
  assert.deepEqual(Array.from(placements.inlineByIndex.keys()), [1]);
  assert.equal(placements.inlineByIndex.get(1)[0].note, "我的体会");

  // 第一章 recap 落在 index 2（下一个同级 heading 之前的最后一个 block）
  assert.equal(placements.recapByIndex.get(2).recap, "第一章小结");
  // 第二章 recap 落在文档结尾 index 4
  assert.equal(placements.recapByIndex.get(4).recap, "第二章小结");
});

test("resolveBrainPlacements is a no-op when brain data is missing or empty", () => {
  const blocks = [{ type: "paragraph", text: "正文" }];
  const empty = core.resolveBrainPlacements(null, blocks);
  assert.equal(empty.inlineByIndex.size, 0);
  assert.equal(empty.recapByIndex.size, 0);

  const noBlocks = core.resolveBrainPlacements({ inline: [{ afterText: "x", note: "y" }] }, []);
  assert.equal(noBlocks.inlineByIndex.size, 0);
});
