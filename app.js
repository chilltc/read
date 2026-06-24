(function () {
  const rawData = window.EBOOK_DATA;
  const core = window.ReaderCore;
  const settingsKey = "qinghua-product-ebook:settings:v2";
  const activeDocumentKey = "qinghua-product-ebook:active-document:v2";
  const progressKeyPrefix = "qinghua-product-ebook:progress:v2";
  const defaults = {
    theme: "green",
    fontSize: 17,
    lineHeight: 1.82,
    width: 39,
    controlsMode: "auto",
  };

  const els = {
    libraryHome: document.getElementById("libraryHome"),
    libraryList: document.getElementById("libraryList"),
    libraryMeta: document.getElementById("libraryMeta"),
    reader: document.getElementById("reader"),
    shelfButton: document.getElementById("shelfButton"),
    tocButton: document.getElementById("tocButton"),
    settingsButton: document.getElementById("settingsButton"),
    tocDrawer: document.getElementById("tocDrawer"),
    settingsSheet: document.getElementById("settingsSheet"),
    scrim: document.getElementById("scrim"),
    shelfList: document.getElementById("shelfList"),
    tocList: document.getElementById("tocList"),
    progressBar: document.getElementById("progressBar"),
    readingMeta: document.getElementById("readingMeta"),
    currentTitle: document.getElementById("currentTitle"),
    fontValue: document.getElementById("fontValue"),
    lineHeightRange: document.getElementById("lineHeightRange"),
    widthRange: document.getElementById("widthRange"),
    prevChapter: document.getElementById("prevChapter"),
    nextChapter: document.getElementById("nextChapter"),
    resumeButton: document.getElementById("resumeButton"),
    themeColor: document.querySelector('meta[name="theme-color"]'),
  };

  if (!rawData) {
    document.body.innerHTML = "<p>电子书数据未加载。</p>";
    return;
  }

  if (!core) {
    document.body.innerHTML = "<p>阅读器核心未加载。</p>";
    return;
  }

  const library = core.normalizeLibrary(rawData);
  const state = Object.assign({}, defaults, readJson(settingsKey));
  let documentData = library.documents.find((item) => item.id === localStorage.getItem(activeDocumentKey));
  if (!documentData) documentData = library.documents[0];

  let documentProgress = readProgress(documentData.id);
  let headingElements = [];
  let imageElements = [];
  let ticking = false;
  let lastScrollY = 0;
  let chromeTimer = 0;
  let currentView = "library";
  const darkMatcher = window.matchMedia ? window.matchMedia("(prefers-color-scheme: dark)") : null;

  function readJson(key) {
    try {
      return JSON.parse(localStorage.getItem(key)) || {};
    } catch (_error) {
      return {};
    }
  }

  function readProgress(documentId) {
    const legacy = readJson("qinghua-product-ebook:v1");
    const saved = readJson(core.documentStateKey(progressKeyPrefix, documentId));
    return {
      scrollY: Number(saved.scrollY ?? (documentId === "qinghua-product-course" ? legacy.scrollY : 0)) || 0,
      progress: Number(saved.progress) || 0,
    };
  }

  function saveSettings() {
    localStorage.setItem(settingsKey, JSON.stringify(core.clampSettings(state)));
  }

  function saveProgress() {
    localStorage.setItem(core.documentStateKey(progressKeyPrefix, documentData.id), JSON.stringify(documentProgress));
    localStorage.setItem(activeDocumentKey, documentData.id);
  }

  function escapeHtml(value) {
    return String(value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;");
  }

  function slug(index) {
    return `block-${index}`;
  }

  function headingBlocks() {
    return (documentData.blocks || [])
      .map((block, index) =>
        block.type === "heading"
          ? {
              id: slug(index),
              page: String(block.page || ""),
              depth: block.depth,
              title: block.text,
            }
          : null
      )
      .filter(Boolean);
  }

  function renderBook() {
    const blocks = documentData.blocks || [];
    const html = [
      `<section class="book-cover" data-page="1">
        <span class="book-kicker">${escapeHtml(library.title)}</span>
        <h1>${escapeHtml(documentData.title)}</h1>
        <p>${escapeHtml(documentData.subtitle || documentData.source || "")}</p>
      </section>`,
    ];

    blocks.forEach((block, index) => {
      const pageAttr = `data-page="${block.page || ""}"`;
      if (block.type === "heading") {
        const tag = block.depth === 1 ? "h2" : block.depth === 2 ? "h3" : "h4";
        html.push(
          `<${tag} id="${slug(index)}" class="book-heading" ${pageAttr}>${escapeHtml(block.text)}</${tag}>`
        );
        return;
      }
      if (block.type === "qa") {
        html.push(`<p class="qa-block" ${pageAttr}>${escapeHtml(block.text)}</p>`);
        return;
      }
      if (block.type === "figures") {
        const images = (block.images || [])
          .map((image) => {
            const width = Number(image.width) || "";
            const height = Number(image.height) || "";
            const ratio = width && height ? ` style="--image-ratio: ${width} / ${height}"` : "";
            const sizeAttrs = width && height ? ` width="${width}" height="${height}"` : "";
            return `<span class="figure-item"${ratio}><img loading="lazy" src="${escapeHtml(
              image.src
            )}" alt="${escapeHtml(image.alt)}"${sizeAttrs}></span>`;
          })
          .join("");
        html.push(
          `<figure class="figure-group" ${pageAttr}>
            <div class="figure-grid">${images}</div>
            <figcaption>第 ${block.page} 页配图</figcaption>
          </figure>`
        );
        return;
      }
      html.push(`<p ${pageAttr}>${escapeHtml(block.text)}</p>`);
    });

    els.reader.innerHTML = html.join("");
    headingElements = Array.from(document.querySelectorAll(".book-heading"));
    imageElements = Array.from(document.querySelectorAll(".figure-item img"));
    imageElements.forEach((image) => {
      image.addEventListener("load", requestReadingUpdate, { once: true });
    });
  }

  function renderLibrary() {
    const groups = groupDocuments();
    const total = library.documents.length;
    els.libraryMeta.textContent = `${total} 本内容，点一本开始阅读`;
    els.libraryList.innerHTML = Array.from(groups.entries())
      .map(([category, items]) => {
        const books = items
          .map((item) => {
            const progress = readProgress(item.id).progress || 0;
            return `<button class="library-book" type="button" data-document-id="${escapeHtml(item.id)}">
              <span class="library-book-main">
                <strong>${escapeHtml(item.title)}</strong>
                <em>${escapeHtml(item.description || item.subtitle || item.source || "")}</em>
              </span>
              <span class="library-progress">${Math.round(progress * 100)}%</span>
            </button>`;
          })
          .join("");
        return `<section class="library-category">
          <h2>${escapeHtml(category)}</h2>
          ${books}
        </section>`;
      })
      .join("");
  }

  function groupDocuments() {
    return library.documents.reduce((acc, item) => {
      const category = item.category || "未分类";
      if (!acc.has(category)) acc.set(category, []);
      acc.get(category).push(item);
      return acc;
    }, new Map());
  }

  function renderShelf() {
    const groups = groupDocuments();

    els.shelfList.innerHTML = Array.from(groups.entries())
      .map(([category, items]) => {
        const books = items
          .map((item) => {
            const progress = readProgress(item.id).progress || 0;
            return `<button class="shelf-item" type="button" data-document-id="${escapeHtml(item.id)}">
              <span>
                <strong>${escapeHtml(item.title)}</strong>
                <em>${escapeHtml(item.description || item.subtitle || item.source || "")}</em>
              </span>
              <small>${Math.round(progress * 100)}%</small>
            </button>`;
          })
          .join("");
        return `<section class="shelf-group">
          <h3>${escapeHtml(category)}</h3>
          ${books}
        </section>`;
      })
      .join("");
    updateShelfState();
  }

  function updateShelfState() {
    document.querySelectorAll(".shelf-item").forEach((button) => {
      button.classList.toggle("active", button.dataset.documentId === documentData.id);
    });
  }

  function renderToc() {
    const headings = headingBlocks();
    const outline = documentData.outline && documentData.outline.length ? documentData.outline : headings;
    els.tocList.innerHTML = outline
      .map((item) => {
        const targetId = item.id || core.resolveTocTarget(item, headings);
        return `<button class="toc-item level-${item.level || item.depth || 1}" type="button" data-page="${
          item.page || ""
        }" data-target="${escapeHtml(targetId)}">
            <span>${escapeHtml(item.title)}</span>
            <span class="toc-page">${escapeHtml(item.page || "")}</span>
          </button>`;
      })
      .join("");
  }

  function applySettings() {
    Object.assign(state, core.clampSettings(state));
    const effectiveTheme = core.resolveEffectiveTheme(state.theme, darkMatcher ? darkMatcher.matches : false);
    document.documentElement.dataset.theme = effectiveTheme;
    document.documentElement.dataset.selectedTheme = state.theme;
    document.body.dataset.controlsMode = state.controlsMode;
    document.documentElement.style.setProperty("--reader-font-size", `${state.fontSize}px`);
    document.documentElement.style.setProperty("--reader-line-height", state.lineHeight);
    document.documentElement.style.setProperty("--reader-width", `${state.width}rem`);
    if (els.themeColor) {
      els.themeColor.setAttribute(
        "content",
        effectiveTheme === "night" ? "#151917" : effectiveTheme === "paper" ? "#f5efdf" : "#e9f0df"
      );
    }
    els.fontValue.value = state.fontSize;
    els.lineHeightRange.value = state.lineHeight;
    els.widthRange.value = state.width;

    document.querySelectorAll("button[data-theme]").forEach((button) => {
      button.classList.toggle("active", button.dataset.theme === state.theme);
    });
    document.querySelectorAll("[data-controls-mode]").forEach((button) => {
      button.classList.toggle("active", button.dataset.controlsMode === state.controlsMode);
    });
    saveSettings();
  }

  function switchDocument(documentId, restorePosition) {
    const next = library.documents.find((item) => item.id === documentId);
    if (!next || next.id === documentData.id) return;
    documentProgress.scrollY = window.scrollY;
    documentProgress.progress = currentProgress();
    saveProgress();

    documentData = next;
    documentProgress = readProgress(documentData.id);
    localStorage.setItem(activeDocumentKey, documentData.id);
    renderBook();
    renderToc();
    updateShelfState();
    showChrome();
    window.scrollTo(0, restorePosition ? documentProgress.scrollY || 0 : 0);
    updateReadingState();
  }

  function enterReader(documentId, restorePosition) {
    if (documentId && documentId !== documentData.id) {
      switchDocument(documentId, restorePosition);
    }
    currentView = "reader";
    document.body.dataset.view = "reader";
    closePanels();
    showChrome();
    window.location.hash = `read-${documentData.id}`;
    window.setTimeout(() => {
      window.scrollTo(0, restorePosition ? documentProgress.scrollY || 0 : 0);
      updateReadingState();
    }, 0);
  }

  function showLibrary() {
    if (currentView === "reader") {
      documentProgress.scrollY = window.scrollY;
      documentProgress.progress = currentProgress();
      saveProgress();
    }
    currentView = "library";
    document.body.dataset.view = "library";
    closePanels();
    renderLibrary();
    history.replaceState(null, "", location.pathname + location.search);
    window.scrollTo(0, 0);
  }

  function openPanel(panel) {
    showChrome();
    els.scrim.hidden = false;
    panel.setAttribute("aria-hidden", "false");
  }

  function closePanels() {
    els.scrim.hidden = true;
    els.tocDrawer.setAttribute("aria-hidden", "true");
    els.settingsSheet.setAttribute("aria-hidden", "true");
  }

  function scrollToTarget(targetId, page) {
    const target = targetId ? document.getElementById(targetId) : document.querySelector(`[data-page="${page}"]`);
    if (target) {
      scrollToElement(target);
      closePanels();
    }
  }

  function scrollToElement(target) {
    const html = document.documentElement;
    const previousBehavior = html.style.scrollBehavior;
    html.style.scrollBehavior = "auto";

    const jump = () => {
      const top = target.getBoundingClientRect().top + window.scrollY - 86;
      window.scrollTo(0, Math.max(0, top));
    };

    jump();
    [80, 180].forEach((delay) => {
      window.setTimeout(jump, delay);
    });
    window.setTimeout(() => {
      html.style.scrollBehavior = previousBehavior;
    }, 240);
  }

  function currentProgress() {
    const doc = document.documentElement;
    const max = Math.max(1, doc.scrollHeight - window.innerHeight);
    return Math.min(1, Math.max(0, window.scrollY / max));
  }

  function currentHeading() {
    return core.findActiveHeading(readHeadingPositions(), window.scrollY, 110);
  }

  function readHeadingPositions() {
    return headingElements.map((heading) => ({
      element: heading,
      title: heading.textContent || documentData.title,
      page: heading.dataset.page,
      top: heading.getBoundingClientRect().top + window.scrollY,
    }));
  }

  function showChrome() {
    document.body.classList.remove("chrome-hidden");
    clearTimeout(chromeTimer);
    if (state.controlsMode === "auto") {
      chromeTimer = window.setTimeout(() => {
        if (window.scrollY > 160 && !isPanelOpen()) {
          document.body.classList.add("chrome-hidden");
        }
      }, 2200);
    }
  }

  function isPanelOpen() {
    return (
      els.tocDrawer.getAttribute("aria-hidden") === "false" ||
      els.settingsSheet.getAttribute("aria-hidden") === "false"
    );
  }

  function updateReadingState() {
    if (currentView !== "reader") return;
    const progress = currentProgress();
    const percent = Math.round(progress * 100);
    const active = currentHeading();
    documentProgress.scrollY = window.scrollY;
    documentProgress.progress = progress;
    els.progressBar.style.width = `${percent}%`;
    els.readingMeta.textContent = `${percent}% · ${documentData.title}`;
    els.resumeButton.textContent = window.scrollY < 60 && documentProgress.scrollY > 120 ? "继续阅读" : "回到顶部";

    els.currentTitle.textContent = active ? active.title || documentData.title : documentData.title;
    const page = active ? active.page : "";
    document.querySelectorAll(".toc-item").forEach((item) => {
      item.classList.toggle("active", Boolean(page) && item.dataset.page === page);
    });
    saveProgress();
  }

  function requestReadingUpdate() {
    if (ticking) return;
    ticking = true;
    requestAnimationFrame(() => {
      updateReadingState();
      updateChromeVisibility();
      ticking = false;
    });
  }

  function updateChromeVisibility() {
    if (currentView !== "reader") return;
    if (state.controlsMode === "always" || isPanelOpen()) {
      document.body.classList.remove("chrome-hidden");
      return;
    }
    const scrollingDown = window.scrollY > lastScrollY + 8;
    const scrollingUp = window.scrollY < lastScrollY - 8;
    if (window.scrollY < 120 || scrollingUp) {
      showChrome();
    } else if (scrollingDown) {
      clearTimeout(chromeTimer);
      document.body.classList.add("chrome-hidden");
    }
    lastScrollY = Math.max(0, window.scrollY);
  }

  function jumpChapter(direction) {
    if (!headingElements.length) return;
    const target = core.findChapterTarget(readHeadingPositions(), window.scrollY, direction);
    if (target && target.element) scrollToElement(target.element);
  }

  function openImage(image) {
    const overlay = document.createElement("button");
    overlay.className = "image-viewer";
    overlay.type = "button";
    overlay.setAttribute("aria-label", "关闭图片预览");
    overlay.innerHTML = `<img src="${escapeHtml(image.currentSrc || image.src)}" alt="${escapeHtml(
      image.alt || "插图"
    )}">`;
    overlay.addEventListener("click", () => overlay.remove());
    document.body.appendChild(overlay);
  }

  function restoreScroll() {
    if (currentView !== "reader" || location.hash) return;
    requestAnimationFrame(() => {
      window.scrollTo(0, Number(documentProgress.scrollY) || 0);
      updateReadingState();
    });
  }

  function bindEvents() {
    els.libraryList.addEventListener("click", (event) => {
      const item = event.target.closest(".library-book");
      if (item) enterReader(item.dataset.documentId, true);
    });
    els.shelfButton.addEventListener("click", showLibrary);
    els.tocButton.addEventListener("click", () => openPanel(els.tocDrawer));
    els.settingsButton.addEventListener("click", () => openPanel(els.settingsSheet));
    els.scrim.addEventListener("click", closePanels);
    document.querySelectorAll("[data-close]").forEach((button) => button.addEventListener("click", closePanels));

    els.shelfList.addEventListener("click", (event) => {
      const item = event.target.closest(".shelf-item");
      if (item) {
        switchDocument(item.dataset.documentId, true);
        closePanels();
      }
    });

    els.tocList.addEventListener("click", (event) => {
      const item = event.target.closest(".toc-item");
      if (item) scrollToTarget(item.dataset.target, item.dataset.page);
    });

    document.querySelectorAll("button[data-theme]").forEach((button) => {
      button.addEventListener("click", () => {
        state.theme = button.dataset.theme;
        applySettings();
      });
    });

    document.querySelectorAll("[data-controls-mode]").forEach((button) => {
      button.addEventListener("click", () => {
        state.controlsMode = button.dataset.controlsMode;
        applySettings();
        showChrome();
      });
    });

    document.querySelectorAll("[data-font]").forEach((button) => {
      button.addEventListener("click", () => {
        state.fontSize = Math.min(24, Math.max(15, state.fontSize + Number(button.dataset.font)));
        applySettings();
      });
    });

    els.lineHeightRange.addEventListener("input", () => {
      state.lineHeight = Number(els.lineHeightRange.value);
      applySettings();
    });

    els.widthRange.addEventListener("input", () => {
      state.width = Number(els.widthRange.value);
      applySettings();
    });

    els.prevChapter.addEventListener("click", () => jumpChapter(-1));
    els.nextChapter.addEventListener("click", () => jumpChapter(1));
    els.resumeButton.addEventListener("click", () => {
      if (window.scrollY < 60) {
        window.scrollTo({ top: documentProgress.scrollY || 0, behavior: "smooth" });
      } else {
        window.scrollTo({ top: 0, behavior: "smooth" });
      }
    });
    els.reader.addEventListener("click", (event) => {
      const image = event.target.closest(".figure-item img");
      if (image) {
        openImage(image);
        return;
      }
      if (!event.target.closest("button, a, input")) showChrome();
    });
    if (darkMatcher) {
      const onThemeChange = () => applySettings();
      if (darkMatcher.addEventListener) {
        darkMatcher.addEventListener("change", onThemeChange);
      } else if (darkMatcher.addListener) {
        darkMatcher.addListener(onThemeChange);
      }
    }
    window.addEventListener("scroll", requestReadingUpdate, { passive: true });
    window.addEventListener("resize", requestReadingUpdate);
    window.addEventListener("keydown", (event) => {
      if (event.key === "Escape") closePanels();
    });
  }

  renderBook();
  renderLibrary();
  renderShelf();
  renderToc();
  applySettings();
  bindEvents();
  const hashDocumentId = location.hash.startsWith("#read-") ? location.hash.slice(6) : "";
  if (hashDocumentId && library.documents.some((item) => item.id === hashDocumentId)) {
    enterReader(hashDocumentId, true);
  } else {
    showLibrary();
  }
  restoreScroll();
})();
