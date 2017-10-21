const puppeteer = require("puppeteer");
const _ = require("highland");
const Url = require("url");
// @ts-ignore
const mapStackTrace = require("sourcemapped-stacktrace-node").default;

/**
 * @param {!Puppeteer.Page} page
 * @param {!Object} options
 * @param {!string} route
 * @return {void}
 */
const enableLogging = ({ page, options, route }) => {
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
  return page;
};

/**
 * @param {!Puppeteer.Page} page
 * @return {Promise<Array<string>>}
 */
const getLinks = async ({ page }) => {
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
 * @param {!Object} options
 * @param {!string} basePath
 * @param {function({ page: !Puppeteer.Page, route: !string }):Promise} beforeFetch
 * @param {function({ page: !Puppeteer.Page, route: !string }):Promise} aferFeth
 * @param {function():void} onEnd
 * @return {Promise}
 */
const crawl = async ({
  options,
  basePath,
  beforeFetch = ({ page, route }) => { ({ page, route }) },
  aferFeth = ({ page, route }) => { ({ page, route }) },
  onEnd = () => {}
}) => {
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
   * @param {string} url
   * @returns {void}
   */
  const addToQueue = (url) => {
    if (Url.parse(url).hostname === "localhost" && !uniqueUrls[url]) {
      uniqueUrls[url] = true;
      enqued++;
      queue.write(url);
    }
  };

  const browser = await puppeteer.launch({
    headless: options.headless
  });
  /**
   * @param {string} url
   * @returns {Promise<string>}
   */
  const fetchPage = async url => {
    if (!shuttingDown) {
      const route = url.replace(basePath, "");
      const page = await browser.newPage();
      if (options.viewport) await page.setViewport(options.viewport);
      enableLogging({ page, options, route });
      beforeFetch({ page, route });
      await page.setUserAgent(options.userAgent);
      await page.goto(url, { waitUntil: "networkidle" });
      if (options.waitFor) await page.waitFor(options.waitFor);
      if (options.crawl) {
        const links = await getLinks({ page });
        links.forEach(addToQueue);
      }
      await aferFeth({ page, route });
      await page.close();
      console.log(`Crawled ${processed + 1} out of ${enqued} (${route})`);
    }
    processed++;
    if (enqued === processed) queue.end();
    return url;
  };

  if (options.include) {
    options.include.map(x => addToQueue(`${basePath}${x}`));
  }

  queue
    .map(x => _(fetchPage(x)))
    .parallel(options.concurrency)
    .toArray(async function() {
      await browser.close();
      onEnd();
    });
};

exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
