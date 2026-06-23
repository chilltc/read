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

  return {
    clampSettings,
    resolveEffectiveTheme,
    findActiveHeading,
    findChapterTarget,
    normalizeTitle,
    resolveTocTarget,
    normalizeLibrary,
    documentStateKey,
  };
});
