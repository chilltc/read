(function (root, factory) {
  if (typeof module === "object" && module.exports) {
    module.exports = factory();
  } else {
    root.ReaderCore = factory();
  }
})(typeof globalThis !== "undefined" ? globalThis : this, function () {
  const themeValues = new Set(["auto", "paper", "green", "night"]);
  const controlsModeValues = new Set(["auto", "always"]);

  function clampNumber(value, min, max, fallback) {
    const number = Number(value);
    if (!Number.isFinite(number)) return fallback;
    return Math.min(max, Math.max(min, number));
  }

  function roundTo(value, decimals) {
    const power = 10 ** decimals;
    return Math.round(value * power) / power;
  }

  function clampSettings(input) {
    const settings = input || {};
    const theme = themeValues.has(settings.theme) ? settings.theme : "green";
    const controlsMode = controlsModeValues.has(settings.controlsMode) ? settings.controlsMode : "auto";

    return {
      theme,
      fontSize: Math.round(clampNumber(settings.fontSize, 15, 24, 17)),
      lineHeight: roundTo(clampNumber(settings.lineHeight, 1.55, 2.15, 1.82), 2),
      width: Math.round(clampNumber(settings.width, 34, 44, 39)),
      controlsMode,
    };
  }

  function resolveEffectiveTheme(theme, prefersDark) {
    if (theme === "auto") {
      return prefersDark ? "night" : "green";
    }
    return themeValues.has(theme) ? theme : "green";
  }

  function findActiveHeading(headings, scrollY, offset) {
    if (!headings || !headings.length) return null;
    const marker = Number(scrollY || 0) + Number(offset || 0);
    let active = headings[0];
    for (const heading of headings) {
      if (heading.top <= marker) {
        active = heading;
      } else {
        break;
      }
    }
    return active;
  }

  function findChapterTarget(headings, scrollY, direction) {
    if (!headings || !headings.length) return null;
    const marker = Number(scrollY || 0) + 120;
    if (direction > 0) {
      return headings.find((heading) => heading.top > marker + 8) || headings[headings.length - 1];
    }
    const currentIndex = headings.findIndex((heading) => heading.top > marker + 8);
    const activeIndex = currentIndex === -1 ? headings.length - 1 : Math.max(0, currentIndex - 1);
    return headings[Math.max(0, activeIndex - 1)];
  }

  function normalizeTitle(value) {
    return String(value || "")
      .replace(/^[一二三四五六七八九十]+[、.]\s*/, "")
      .replace(/^\d+[、.]\s*/, "")
      .replace(/\s+/g, "")
      .trim();
  }

  function resolveTocTarget(item, headings) {
    const title = normalizeTitle(item.title);
    const page = String(item.page || "");
    const samePage = (headings || []).filter((heading) => String(heading.page || "") === page);
    const exact = samePage.find((heading) => normalizeTitle(heading.title) === title);
    if (exact) return exact.id;

    const loose = samePage.find((heading) => {
      const headingTitle = normalizeTitle(heading.title);
      return headingTitle.includes(title) || title.includes(headingTitle);
    });
    if (loose) return loose.id;

    const pagePrimary = samePage.find((heading) => Number(heading.depth) === Number(item.level));
    if (pagePrimary) return pagePrimary.id;

    return samePage[0] ? samePage[0].id : "";
  }

  function slugifyDocumentId(value, fallback) {
    const text = String(value || "")
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9\u4e00-\u9fa5]+/g, "-")
      .replace(/^-+|-+$/g, "");

    if (text === "王慧文清华产品课") return "qinghua-product-course";
    return text || fallback;
  }

  function normalizeLibrary(data) {
    const input = data || {};
    const documents = Array.isArray(input.documents) && input.documents.length ? input.documents : [input];
    return {
      title: input.libraryTitle || input.title || "电子书",
      documents: documents.map((document, index) => ({
        ...document,
        id: document.id || slugifyDocumentId(document.title, `document-${index + 1}`),
        title: document.title || `文档 ${index + 1}`,
        subtitle: document.subtitle || "",
        outline: Array.isArray(document.outline) ? document.outline : [],
        blocks: Array.isArray(document.blocks) ? document.blocks : [],
      })),
    };
  }

  function documentStateKey(baseKey, documentId) {
    return `${baseKey}:${documentId}`;
  }

  // --- Brain Page（书镜）锚点匹配 ---
  // 把脑页数据（inline 就近映射 + chapters 章末小结）定位到正文 blocks 的具体位置。
  // 返回纯数据，便于在 renderBook 里按 block index 注入，也便于单测。

  function normalizeAnchor(value) {
    // 去掉所有空白并小写化，用于模糊匹配（容忍重建后细微差异）。
    return String(value || "")
      .replace(/\s+/g, "")
      .toLowerCase();
  }

  function resolveBrainPlacements(brainDoc, blocks) {
    const result = { inlineByIndex: new Map(), recapByIndex: new Map() };
    if (!brainDoc || !Array.isArray(blocks) || !blocks.length) return result;

    // 1) inline：每条 afterText 匹配一个 paragraph/qa 段落开头，插在该段之后。
    const inlineEntries = Array.isArray(brainDoc.inline) ? brainDoc.inline : [];
    const usedBlocks = new Set();
    inlineEntries.forEach((entry) => {
      const anchor = normalizeAnchor(entry && entry.afterText);
      if (!anchor) return;
      let matchIndex = -1;
      for (let i = 0; i < blocks.length; i += 1) {
        if (usedBlocks.has(i)) continue;
        const block = blocks[i];
        if (block.type !== "paragraph" && block.type !== "qa") continue;
        const text = normalizeAnchor(block.text);
        if (text.startsWith(anchor) || text.includes(anchor)) {
          matchIndex = i;
          break;
        }
      }
      if (matchIndex === -1) return;
      usedBlocks.add(matchIndex);
      if (!result.inlineByIndex.has(matchIndex)) result.inlineByIndex.set(matchIndex, []);
      result.inlineByIndex.get(matchIndex).push(entry);
    });

    // 2) chapters：anchorTitle 匹配 heading，recap 插在该章末尾
    //    （下一个同级或更高级 heading 之前，或文档结尾）。
    const chapterEntries = Array.isArray(brainDoc.chapters) ? brainDoc.chapters : [];
    const usedHeadings = new Set();
    chapterEntries.forEach((entry) => {
      const anchor = normalizeAnchor(entry && entry.anchorTitle);
      if (!anchor) return;
      let headingIndex = -1;
      for (let i = 0; i < blocks.length; i += 1) {
        if (usedHeadings.has(i)) continue;
        const block = blocks[i];
        if (block.type !== "heading") continue;
        const text = normalizeAnchor(block.text);
        if (text === anchor || text.includes(anchor) || anchor.includes(text)) {
          headingIndex = i;
          break;
        }
      }
      if (headingIndex === -1) return;
      usedHeadings.add(headingIndex);

      const depth = Number(blocks[headingIndex].depth) || 1;
      let endIndex = blocks.length - 1;
      for (let j = headingIndex + 1; j < blocks.length; j += 1) {
        const block = blocks[j];
        if (block.type === "heading" && (Number(block.depth) || 1) <= depth) {
          endIndex = j - 1;
          break;
        }
      }
      result.recapByIndex.set(endIndex, entry);
    });

    return result;
  }

  return {
    clampSettings,
    resolveEffectiveTheme,
    findActiveHeading,
    findChapterTarget,
    normalizeTitle,
    resolveTocTarget,
    normalizeLibrary,
    documentStateKey,
    normalizeAnchor,
    resolveBrainPlacements,
  };
});
