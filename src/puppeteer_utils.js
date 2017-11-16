const puppeteer = require("puppeteer");
const _ = require("highland");
const url = require("url");
const path = require("path");
// @ts-ignore
const mapStackTrace = require("sourcemapped-stacktrace-node").default;

/**
 * @param {{page: Page, options: {skipThirdPartyRequests: true}, basePath: string }} opt
 * @return {Promise<void>}
 */
const skipThirdPartyRequests = async opt => {
  const { page, options, basePath } = opt;
  if (!options.skipThirdPartyRequests) return;
  await page.setRequestInterceptionEnabled(true);
  page.on("request", request => {
    if (request.url.startsWith(basePath)) {
      request.continue();
    } else {
      request.abort();
    }
  });
};

/**
 * @param {{page: Page, options: {sourceMaps: boolean}, route: string, onError: ?function }} opt
 * @return {void}
 */
const enableLogging = opt => {
  const { page, options, route, onError } = opt;
  page.on("console", msg => console.log(`☝  ${route} log:`, msg));
  page.on("error", msg => console.log(`🔥  ${route} error:`, msg));
  page.on("pageerror", e => {
    if (options.sourceMaps) {
      mapStackTrace(
        e.stack,
        result => {
          console.log(
            `🔥  ${route} pageerror: ${e.stack.split("\n")[0] +
              "\n"}${result.join("\n")}`
          );
        },
        { isChromeOrEdge: true }
      );
    } else {
      console.log(`🔥  ${route} pageerror:`, e);
    }
    onError && onError();
  });
  // page.on("requestfailed", msg =>
  //   console.log(`${route} requestfailed:`, msg)
  // );
};

/**
 * @param {{page: Page}} opt
 * @return {Promise<Array<string>>}
 */
const getLinks = async opt => {
  const { page } = opt;
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(anchor => anchor.href)
  );

  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("iframe")).map(iframe => iframe.src)
  );
  return anchors.concat(iframes);
};

/**
 * can not use null as default for function because of TS error https://github.com/Microsoft/TypeScript/issues/14889
 *
 * @param {{options: *, basePath: string, beforeFetch: ?(function({ page: Page, route: string }):Promise), afterFetch: ?(function({ page: Page, browser: Browser, route: string }):Promise), onEnd: ?(function():void)}} opt
 * @return {Promise}
 */
const crawl = async opt => {
  const { options, basePath, beforeFetch, afterFetch, onEnd, publicPath } = opt;
  let shuttingDown = false;
  let streamClosed = false;
  // TODO: this doesn't work as expected
  // process.stdin.resume();
  process.on("SIGINT", () => {
    if (shuttingDown) {
      process.exit(0);
    } else {
      shuttingDown = true;
      console.log(
        "\nGracefully shutting down. To exit immediately, press ^C again"
      );
    }
  });

  const queue = _();
  let enqued = 0;
  let processed = 0;
  // use Set instead
  const uniqueUrls = new Set();

  /**
   * @param {string} path
   * @returns {void}
   */
  const addToQueue = newUrl => {
    const { hostname, search, hash } = url.parse(newUrl);
    newUrl = newUrl.replace(`${search || ""}${hash || ""}`, "");
    if (hostname === "localhost" && !uniqueUrls.has(newUrl) && !streamClosed) {
      uniqueUrls.add(newUrl);
      enqued++;
      queue.write(newUrl);
      if (enqued == 2) {
        addToQueue(`${basePath}${publicPath + "/404"}`);
      }
    }
  };

  const browser = await puppeteer.launch({
    headless: options.headless,
    args: options.puppeteerArgs,
    handleSIGINT: false
  });

  /**
   * @param {string} pageUrl
   * @returns {Promise<string>}
   */
  const fetchPage = async pageUrl => {
    if (!shuttingDown) {
      const route = pageUrl.replace(basePath, "");
      try {
        const page = await browser.newPage();
        if (options.viewport) await page.setViewport(options.viewport);
        if (options.skipThirdPartyRequests)
          await skipThirdPartyRequests({ page, options, basePath });
        enableLogging({
          page,
          options,
          route,
          onError: () => {
            shuttingDown = true;
          }
        });
        beforeFetch && beforeFetch({ page, route });
        await page.setUserAgent(options.userAgent);
        await page.goto(pageUrl, { waitUntil: "networkidle" });
        if (options.waitFor) await page.waitFor(options.waitFor);
        if (options.crawl) {
          const links = await getLinks({ page });
          links.forEach(addToQueue);
        }
        afterFetch && (await afterFetch({ page, route, browser }));
        await page.close();
        console.log(`🕸  (${processed + 1}/${enqued}) ${route}`);
      } catch (e) {
        if (!shuttingDown) {
          console.log(`🔥  ${route} ${e}`);
        }
        shuttingDown = true;
      }
    }
    processed++;
    if (enqued === processed) {
      streamClosed = true;
      queue.end();
    }
    return pageUrl;
  };

  if (options.include) {
    options.include.map(x => addToQueue(`${basePath}${x}`));
  }

  queue
    .map(x => _(fetchPage(x)))
    .mergeWithLimit(options.concurrency)
    .toArray(async function() {
      await browser.close();
      onEnd && onEnd();
      if (shuttingDown) process.exit(1);
    });
};

exports.skipThirdPartyRequests = skipThirdPartyRequests;
exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
