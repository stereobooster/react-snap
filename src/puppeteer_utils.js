const puppeteer = require("puppeteer");
const mapStackTrace = require("sourcemapped-stacktrace-node").default;
const _ = require("highland");
const Url = require("url");

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

const getLinks = async ({ page }) => {
  const anchors = await page.evaluate(() =>
    Array.from(document.querySelectorAll("a")).map(anchor => anchor.href)
  );

  const iframes = await page.evaluate(() =>
    Array.from(document.querySelectorAll("iframe")).map(iframe => iframe.src)
  );
  return anchors.concat(iframes);
};

const crawl = async ({
  options,
  basePath,
  beforeFetch = null,
  aferFeth = null,
  onEnd = null
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
  const addToQueue = (url, referer) => {
    if (Url.parse(url).hostname === "localhost" && !uniqueUrls[url]) {
      uniqueUrls[url] = true;
      enqued++;
      queue.write(url);
    }
  };

  const browser = await puppeteer.launch({
    headless: options.headless
  });
  const fetchPage = async url => {
    if (!shuttingDown) {
      const route = url.replace(basePath, "");
      const page = await browser.newPage();
      if (options.viewport) await page.setViewport(options.viewport);
      enableLogging({ page, options, route });
      if (beforeFetch) beforeFetch({ page, route });
      await page.setUserAgent(options.userAgent);
      await page.goto(url, { waitUntil: "networkidle" });
      if (options.waitFor) await page.waitFor(options.waitFor);
      if (options.crawl) {
        const links = await getLinks({ page });
        links.forEach(addToQueue);
      }
      if (aferFeth) await aferFeth({ page, route });
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
    .toArray(async function(urls) {
      await browser.close();
      if (onEnd) {
        onEnd();
      }
    });
};

exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
