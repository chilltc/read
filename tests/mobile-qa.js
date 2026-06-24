const assert = require("node:assert/strict");
const path = require("node:path");
const { chromium } = require("playwright");

const root = path.resolve(__dirname, "..");
const url = "http://127.0.0.1:8080/";

(async () => {
  const browser = await chromium.launch();
  const page = await browser.newPage({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    userAgent:
      "Mozilla/5.0 (iPhone; CPU iPhone OS 17_5 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Mobile/15E148 MicroMessenger/8.0.49",
  });

  const consoleErrors = [];
  const failedRequests = [];
  page.on("console", (message) => {
    if (message.type() === "error") consoleErrors.push(message.text());
  });
  page.on("requestfailed", (request) => failedRequests.push(`${request.url()} ${request.failure()?.errorText || ""}`));

  await page.goto(url, { waitUntil: "networkidle" });
  await assertVisible(page, ".library-home");
  assert.equal(await page.locator(".library-book").count(), 3);
  await page.screenshot({ path: path.join(root, "tmp-mobile-home.png"), fullPage: false });

  await page.getByRole("button", { name: /Token 资本/ }).click();
  await page.waitForTimeout(250);
  assert.match((await page.locator(".book-cover h1").textContent()) || "", /Token 资本/);

  await page.getByRole("button", { name: "书架" }).click();
  await assertVisible(page, ".library-home");
  await page.getByRole("button", { name: /王慧文清华产品课/ }).click();
  await page.waitForTimeout(250);

  await page.getByRole("button", { name: "阅读设置" }).click();
  await assertVisible(page, ".settings-sheet[aria-hidden='false']");
  await page.getByRole("button", { name: "夜间" }).click();
  assert.equal(await page.locator("html").getAttribute("data-theme"), "night");
  await page.screenshot({ path: path.join(root, "tmp-mobile-settings.png"), fullPage: false });
  await page.getByRole("button", { name: "关闭" }).click();

  await page.getByRole("button", { name: "目录" }).click();
  await assertVisible(page, ".drawer[aria-hidden='false']");
  assert.equal(await page.locator(".shelf-item").count(), 3);

  await page.getByRole("button", { name: /Token 资本/ }).click();
  await page.waitForTimeout(250);
  assert.match((await page.locator(".book-cover h1").textContent()) || "", /Token 资本/);

  await page.getByRole("button", { name: "目录" }).click();
  await page.getByRole("button", { name: /Fable 5事件/ }).click();
  await page.waitForTimeout(250);
  assert.match((await page.locator(".book-cover h1").textContent()) || "", /Fable 5事件|中国开源AI/);

  await page.getByRole("button", { name: "目录" }).click();
  await page.getByRole("button", { name: /王慧文清华产品课/ }).click();
  await page.waitForTimeout(250);
  await page.getByRole("button", { name: "目录" }).click();
  await page.getByRole("button", { name: /二、战略/ }).click();
  await page.waitForTimeout(350);
  const titleAfterToc = await page.locator("#currentTitle").textContent();
  assert.match(titleAfterToc || "", /战略|市场体量|规模效应/);

  await page.getByText("3. 张小龙").scrollIntoViewIfNeeded();
  await page.waitForTimeout(500);
  const overflowingFigures = await page.locator(".figure-item").evaluateAll((items) =>
    items
      .map((item) => {
        const image = item.querySelector("img");
        if (!image) return null;
        const itemRect = item.getBoundingClientRect();
        const imageRect = image.getBoundingClientRect();
        return {
          src: image.getAttribute("src"),
          overflowBottom: Math.round(imageRect.bottom - itemRect.bottom),
          overflowTop: Math.round(itemRect.top - imageRect.top),
        };
      })
      .filter(Boolean)
      .filter((entry) => entry.overflowBottom > 1 || entry.overflowTop > 1)
  );
  assert.deepEqual(overflowingFigures, []);

  await page.mouse.wheel(0, 1100);
  await page.waitForTimeout(450);
  const chromeHidden = await page.locator("body").evaluate((body) => body.classList.contains("chrome-hidden"));
  assert.equal(chromeHidden, true);
  await page.screenshot({ path: path.join(root, "tmp-mobile-reading.png"), fullPage: false });

  assert.deepEqual(consoleErrors, []);
  assert.deepEqual(failedRequests, []);
  await browser.close();
})();

async function assertVisible(page, selector) {
  await page.waitForSelector(selector, { state: "visible", timeout: 2000 });
}
