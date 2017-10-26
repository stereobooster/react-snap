const puppeteer = require("puppeteer");
const _ = require("highland");
const url = require("url");
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
 * @param {{page: Page, options: {sourceMaps: boolean}, route: string}} opt
 * @return {void}
 */
const enableLogging = opt => {
  const { page, options, route } = opt;
  page.on("console", msg => console.log(`${route} log:`, msg));
  page.on("error", msg => console.log(`${route} error:`, msg));
  page.on("pageerror", e => {
    if (options.sourceMaps) {
      mapStackTrace(
        e.stack,
        result => {
          console.log(
            `${route} pageerror: ${e.stack.split("\n")[0] + "\n"}${result.join(
              "\n"
            )}`
          );
        },
        { isChromeOrEdge: true }
      );
    } else {
      console.log(`${route} pageerror:`, e);
    }
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
 * @param {{options: *, basePath: string, beforeFetch: ?(function({ page: Page, route: string }):Promise), afterFetch: ?(function({ page: Page, route: string }):Promise), onEnd: ?(function():void)}} opt
 * @return {Promise}
 */
const crawl = async opt => {
  const { options, basePath, beforeFetch, afterFetch, onEnd } = opt;
  let shuttingDown = false;
  // TODO: this doesn't work as expected
  process.on("SIGINT", () => {
    if (shuttingDown) {
      process.exit();
    } else {
      shuttingDown = true;
      console.log(
        "Gracefully shutting down. To exit immediately, press ^C again"
      );
    }
  });

  const queue = _();
  let enqued = 0;
  let processed = 0;
  const uniqueUrls = {};

  /**
   * @param {string} path
   * @returns {void}
   */
  const addToQueue = path => {
    if (url.parse(path).hostname === "localhost" && !uniqueUrls[path]) {
      uniqueUrls[path] = true;
      enqued++;
      queue.write(path);
    }
  };

  const browser = await puppeteer.launch({
    headless: options.headless
  });

  /**
   * @param {string} pageUrl
   * @returns {Promise<string>}
   */
  const fetchPage = async pageUrl => {
    if (!shuttingDown) {
      const route = pageUrl.replace(basePath, "");
      const page = await browser.newPage();
      if (options.viewport) await page.setViewport(options.viewport);
      if (options.skipThirdPartyRequests)
        await skipThirdPartyRequests({ page, options, basePath });
      enableLogging({ page, options, route });
      beforeFetch && beforeFetch({ page, route });
      await page.setUserAgent(options.userAgent);
      await page.goto(pageUrl, { waitUntil: "networkidle" });
      if (options.waitFor) await page.waitFor(options.waitFor);
      if (options.crawl) {
        const links = await getLinks({ page });
        links.forEach(addToQueue);
      }
      afterFetch && (await afterFetch({ page, route }));
      await page.close();
      console.log(`Crawled ${processed + 1} out of ${enqued} (${route})`);
    }
    processed++;
    if (enqued === processed) queue.end();
    return pageUrl;
  };

  if (options.include) {
    options.include.map(x => addToQueue(`${basePath}${x}`));
  }

  queue
    .map(x => _(fetchPage(x)))
    .parallel(options.concurrency)
    .toArray(async function() {
      await browser.close();
      onEnd && onEnd();
    });
};

exports.skipThirdPartyRequests = skipThirdPartyRequests;
exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
