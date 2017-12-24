const _ = require("highland");
const url = require("url");
const path = require("path");
const jsdom = require("jsdom");
const { JSDOM } = jsdom;
const { renderToString } = require("react-dom/server");
const fetch = require("node-fetch");
// @ts-ignore
// const mapStackTrace = require("sourcemapped-stacktrace-node").default;

/**
 * @param {{page: Page, options: {skipThirdPartyRequests: true}, basePath: string }} opt
 * @return {Promise<void>}
 */
const skipThirdPartyRequests = async opt => {
  const { page, options, basePath } = opt;
  if (!options.skipThirdPartyRequests) return;
  // await page.setRequestInterceptionEnabled(true);
  // page.on("request", request => {
  //   if (request.url.startsWith(basePath)) {
  //     request.continue();
  //   } else {
  //     request.abort();
  //   }
  // });
};

/**
 * @param {{page: Page, options: {sourceMaps: boolean}, route: string, onError: ?function }} opt
 * @return {void}
 */
const enableLogging = opt => {
  const { page, options, route, onError, sourcemapStore } = opt;
  // page.on("console", msg => console.log(`✏️  ${route} log:`, msg));
  // page.on("error", msg => {
  //   console.log(`🔥  ${route} error:`, msg);
  //   onError && onError();
  // });
  // page.on("pageerror", e => {
  //   if (options.sourceMaps) {
  //     mapStackTrace(e.stack, {
  //       isChromeOrEdge: true,
  //       store: sourcemapStore || {}
  //     }).then(result => {
  //       // TODO: refactor mapStackTrace: return array not a string, return first row too
  //       const stackRows = result.split("\n");
  //       const puppeteerLine =
  //         stackRows.findIndex(x => x.includes("puppeteer")) ||
  //         stackRows.length - 1;

  //       console.log(
  //         `🔥  ${route} pageerror: ${e.stack.split("\n")[0] +
  //           "\n"}${stackRows.slice(0, puppeteerLine).join("\n")}`
  //       );
  //     });
  //   } else {
  //     console.log(`🔥  ${route} pageerror:`, e);
  //   }
  //   onError && onError();
  // });
};

/**
 * @param {{page: Page}} opt
 * @return {Promise<Array<string>>}
 */
const getLinks = opt => {
  const { page, currentPath } = opt;
  const document = page.document;
  const tagAttributeMap = {
    a: "href",
    iframe: "src"
  };

  return Object.keys(tagAttributeMap).forEach(tagName => {
    const urlAttribute = tagAttributeMap[tagName];
    Array.from(
      document.querySelectorAll(`${tagName}[${urlAttribute}]`)
    ).forEach(element => {
      if (element.getAttribute("target") === "_blank") return;
      const href = url.parse(element.getAttribute(urlAttribute));
      if (href.protocol || href.host || href.path === null) return;
      const relativePath = url.resolve(currentPath, href.path);
      if (
        path.extname(relativePath) !== ".html" &&
        path.extname(relativePath) !== ""
      )
        return;
      if (this.processed[relativePath]) return;
      if (this.exclude.filter(regex => regex.test(relativePath)).length > 0)
        return;
      this.paths.push(relativePath);
    });
  });
};

/**
 * can not use null as default for function because of TS error https://github.com/Microsoft/TypeScript/issues/14889
 *
 * @param {{options: *, basePath: string, beforeFetch: ?(function({ page: Page, route: string }):Promise), afterFetch: ?(function({ page: Page, route: string }):Promise), onEnd: ?(function():void)}} opt
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
      process.exit(1);
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

  /**
   * @param {string} pageUrl
   * @returns {Promise<string>}
   */
  const fetchPage = async pageUrl => {
    const route = pageUrl.replace(basePath, "");
    if (!shuttingDown) {
      try {
        const page = await new Promise((resolve, reject) => {
          let reactSnapshotRenderCalled = false;
          console.log(pageUrl);
          jsdom.env({
            url: pageUrl,
            headers: {
              Accept:
                "text/html,application/xhtml+xml,application/xml;q=0.9,image/webp,*/*;q=0.8"
            },
            userAgent: options.userAgent,
            resourceLoader(resource, callback) {
              if (resource.url.host === host) {
                resource.defaultFetch(callback);
              } else {
                callback();
              }
            },
            features: {
              FetchExternalResources: ["script"],
              ProcessExternalResources: ["script"],
              SkipExternalResources: false
            },
            virtualConsole: jsdom.createVirtualConsole().sendTo(console),
            created: (err, window) => {
              if (err) return reject(err);
              if (!window) return reject(`Looks like no page exists at ${url}`);
              window.fetch = (path, options) => {
                // TODO: only if relative
                path = url.resolve(window.location.toString(), path);
                return fetch(path, options);
              };
              window.reactSnapshotRender = rootComponent => {
                reactSnapshotRenderCalled = true;
                setTimeout(() => {
                  resolve(window);
                }, delay);
                return renderToString(rootComponent);
              };
            },
            done: (err, window) => {
              if (!reactSnapshotRenderCalled) {
                reject(
                  "'render' from react-snap was never called. Did you replace the call to ReactDOM.render()?"
                );
              }
            }
          });
        });

        // if (options.skipThirdPartyRequests)
        //   await skipThirdPartyRequests({ page, options, basePath });
        // beforeFetch && beforeFetch({ page, route });
        if (options.crawl) {
          const links = getLinks({ page });
          links.forEach(addToQueue);
        }
        // afterFetch && (await afterFetch({ page, route }));
        console.log(`🕸  (${processed + 1}/${enqued}) ${route}`);
      } catch (e) {
        if (!shuttingDown) {
          console.log(`🔥  ${route} ${e.stack || e}`);
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

  queue
    .map(x => _(fetchPage(x)))
    .mergeWithLimit(options.concurrency)
    .toArray(async function() {
      onEnd && onEnd();
      if (shuttingDown) process.exit(1);
    });
};

exports.skipThirdPartyRequests = skipThirdPartyRequests;
exports.enableLogging = enableLogging;
exports.getLinks = getLinks;
exports.crawl = crawl;
