const puppeteer = require("puppeteer");
const _ = require("highland");
const url = require("url");
const mapStackTrace = require("sourcemapped-stacktrace-node").default;
const path = require("path");
const fs = require("fs");

/**
 * @param {{page: Page, options: {skipThirdPartyRequests: true}, basePath: string }} opt
 * @return {Promise<void>}
 */
const skipThirdPartyRequests = async opt => {
  const { page, options, basePath } = opt;
  if (!options.skipThirdPartyRequests) return;
  await page.setRequestInterception(true);
  page.on("request", request => {
    if (request.url().startsWith(basePath)) {
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
  const { page, options, route, onError, sourcemapStore } = opt;
  page.on("console", msg =>
    Promise.all(msg.args().map(x => x.jsonValue())).then(args =>
      console.log(`✏️  ${route} log:`, ...args)
    )
  );
  page.on("error", msg => {
    console.log(`🔥  ${route} error:`, msg);
    onError && onError();
  });
  page.on("pageerror", e => {
    if (options.sourceMaps) {
      mapStackTrace(e.stack || e.message, {
        isChromeOrEdge: true,
        store: sourcemapStore || {}
      })
        .then(result => {
          // TODO: refactor mapStackTrace: return array not a string, return first row too
          const stackRows = result.split("\n");
          const puppeteerLine =
            stackRows.findIndex(x => x.includes("puppeteer")) ||
            stackRows.length - 1;

          console.log(
            `🔥  ${route} pageerror: ${(e.stack || e.message).split("\n")[0] +
              "\n"}${stackRows.slice(0, puppeteerLine).join("\n")}`
          );
        })
        .catch(e2 => {
          console.log(`🔥  ${route} pageerror:`, e);
          console.log(`️️️⚠️  ${route} error in Source Maps:`, e2.message);
        });
    } else {
      console.log(`🔥  ${route} pageerror:`, e);
    }
    onError && onError();
  });
  page.on("response", response => {
    if (response.status() >= 400) {
      let route = ''
      try {
        route = response._request.headers().referer.replace(`http://localhost:${options.port}`, "");
      } catch (e) {}
      console.log(`⚠️   ${route} ${response.status()} error: ${response.url()}`);
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
 * @param {{options: *, basePath: string, beforeFetch: ?(function({ page: Page, route: string }):Promise), afterFetch: ?(function({ page: Page, browser: Browser, route: string }):Promise), onEnd: ?(function():void)}} opt
 * @return {Promise}
 */
const crawl = async opt => {
  const {
    options,
    basePath,
    beforeFetch,
    afterFetch,
    onEnd,
    publicPath,
    sourceDir
  } = opt;
  let shuttingDown = false;
  let streamClosed = false;

  const onSigint = () => {
    if (shuttingDown) {
      process.exit(1);
    } else {
      shuttingDown = true;
      console.log(
        "\nGracefully shutting down. To exit immediately, press ^C again"
      );
    }
  };
  process.on("SIGINT", onSigint);

  const onUnhandledRejection = error => {
    console.log("UnhandledPromiseRejectionWarning", error);
    shuttingDown = true;
  };
  process.on("unhandledRejection", onUnhandledRejection);

  const queue = _();
  let enqued = 0;
  let processed = 0;
  // use Set instead
  const uniqueUrls = new Set();
  const sourcemapStore = {};

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
      if (enqued == 2 && options.crawl) {
        addToQueue(`${basePath}${publicPath}/404.html`);
      }
    }
  };

  const browser = await puppeteer.launch({
    headless: options.headless,
    args: options.puppeteerArgs,
    executablePath: options.puppeteerExecutablePath,
    ignoreHTTPSErrors: options.puppeteerIgnoreHTTPSErrors,
    handleSIGINT: false
  });

  /**
   * @param {string} pageUrl
   * @returns {Promise<string>}
   */
  const fetchPage = async pageUrl => {
    const route = pageUrl.replace(basePath, "");

    let skipExistingFile = false;
    const routePath = route.replace(/\//g, path.sep);
    const { ext } = path.parse(routePath);
    if (ext !== ".html" && ext !== "") {
      const filePath = path.join(sourceDir, routePath);
      skipExistingFile = fs.existsSync(filePath);
    }

    if (!shuttingDown && !skipExistingFile) {
      try {
        const page = await browser.newPage();
        await page.setCacheEnabled(options.puppeteer.cache);
        if (options.viewport) await page.setViewport(options.viewport);
        if (options.skipThirdPartyRequests)
          await skipThirdPartyRequests({ page, options, basePath });
        enableLogging({
          page,
          options,
          route,
          onError: () => {
            shuttingDown = true;
          },
          sourcemapStore
        });
        beforeFetch && beforeFetch({ page, route });
        await page.setUserAgent(options.userAgent);
        await page.goto(pageUrl, { waitUntil: "networkidle0" });
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
          console.log(`🔥  ${route}`, e);
        }
        shuttingDown = true;
      }
    } else {
      console.log(`🚧  skipping (${processed + 1}/${enqued}) ${route}`);
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

  return new Promise((resolve, reject) => {
    queue
      .map(x => _(fetchPage(x)))
      .mergeWithLimit(options.concurrency)
      .toArray(async () => {
        process.removeListener("SIGINT", onSigint);
        process.removeListener("unhandledRejection", onUnhandledRejection);
        await browser.close();
        onEnd && onEnd();
        if (shuttingDown) return reject("");
        resolve();
      });
  });
};

exports.skipThirdPartyRequests = skipThirdPartyRequests;
exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
