const puppeteer = require("puppeteer");
const http = require("http");
const express = require("express");
const serveStatic = require("serve-static");
const fallback = require("express-history-api-fallback");
const path = require("path");
const Url = require("url");
const _ = require("highland");
const fs = require("fs");
const mkdirp = require("mkdirp");
const minify = require("html-minifier").minify;
const minimalcss = require("minimalcss");
const mapStackTrace = require("sourcemapped-stacktrace-node").default;

const defaultOptions = {
  port: 45678,
  source: "build",
  destination: null,
  concurrency: 4,
  viewport: false,
  include: ["/", "/404"],
  removeStyleTags: false,
  minimalCss: false, // depricated
  inlineCss: false, // experimental
  sourceMaps: false, // experimental
  headless: true,
  userAgent: "ReactSnap",
  saveAs: "html",
  crawl: true,
  waitFor: false,
  externalServer: false,
  minifyOptions: {
    minifyCSS: true,
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    collapseInlineTagWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    sortAttributes: true,
    sortClassName: true
  }
};

const defaults = reactSnap => {
  const options = {
    ...defaultOptions,
    ...reactSnap
  };
  options.destination = options.destination || options.source;
  if (!options.include || !options.include.length)
    throw new Error("include should be an array");
  return options;
};

const preloadPolyfill = fs.readFileSync(
  `${__dirname}/vendor/preload_polyfill.min.js`,
  "utf8"
);

const crawl = async reactSnap => {
  const options = defaults(reactSnap);
  let shuttingDown = false;
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

  const sourceDir = path.normalize(`${process.cwd()}/${options.source}`);
  const destinationDir = path.normalize(
    `${process.cwd()}/${options.destination}`
  );
  const startServer = options => {
    const app = express()
      .use(serveStatic(sourceDir))
      .use(fallback("200.html", { root: sourceDir }));
    const server = http.createServer(app);
    server.listen(options.port);
    return server;
  };

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

  const basePath = `http://localhost:${options.port}`;
  const browser = await puppeteer.launch({
    headless: options.headless
  });
  const cssLinks = new Set();
  const fetchPage = async url => {
    if (!shuttingDown) {
      const route = url.replace(basePath, "");
      const page = await browser.newPage();
      if (options.viewport) {
        await page.setViewport(options.viewport);
      }
      page.on("console", msg => console.log(`${route} log:`, msg));
      page.on("error", msg => console.log(`${route} error:`, msg));
      page.on("pageerror", e => {
        if (options.sourceMaps) {
          mapStackTrace(
            e.stack,
            result => {
              console.log(
                `${route} pageerror: ${e.stack.split("\n")[0] +
                  "\n"}${result.join("\n")}`
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
      const uniqueResources = {};
      page.on("response", async response => {
        // TODO: this can be improved
        const url = response.url;
        if (/^data:/i.test(url)) return;
        const ct = response.headers["content-type"] || "";
        const route = url.replace(basePath, "");
        if (/^http:\/\/localhost/i.test(url)) {
          if (uniqueResources[url]) return;
          if (/\.(png|jpg|jpeg)$/.test(url)) {
            await page.evaluate(route => {
              var linkTag = document.createElement("link");
              linkTag.setAttribute("rel", "preload");
              linkTag.setAttribute("as", "image");
              linkTag.setAttribute("href", route);
              document.body.appendChild(linkTag);
            }, route);
          } else if (ct.indexOf("json") > -1) {
            const text = await response.text();
            await page.evaluate(
              (route, text) => {
                var scriptTag = document.createElement("script");
                scriptTag.type = "text/javascript";
                scriptTag.text = [
                  'window.snapStore = window.snapStore || {}; window.snapStore["',
                  route,
                  '"] = ',
                  text,
                  ";"
                ].join("");
                document.body.appendChild(scriptTag);
              },
              route,
              text
            );
          }
          uniqueResources[url] = true;
        } else {
          const urlObj = Url.parse(url);
          const domain = `${urlObj.protocol}//${urlObj.host}`;
          if (uniqueResources[domain]) return;
          await page.evaluate(route => {
            var linkTag = document.createElement("link");
            linkTag.setAttribute("rel", "preconnect");
            linkTag.setAttribute("href", route);
            document.head.appendChild(linkTag);
          }, domain);
          uniqueResources[domain] = true;
        }
      });
      await page.setUserAgent(options.userAgent);
      await page.goto(url, { waitUntil: "networkidle" });
      if (options.waitFor) {
        await page.waitFor(options.waitFor);
      }
      if (options.crawl) {
        const anchors = await page.evaluate(() =>
          Array.from(document.querySelectorAll("a")).map(anchor => anchor.href)
        );
        anchors.map(addToQueue);
        const iframes = await page.evaluate(() =>
          Array.from(document.querySelectorAll("iframe")).map(
            iframe => iframe.src
          )
        );
        iframes.map(addToQueue);
        if (options.removeStyleTags) {
          await page.evaluate(() => {
            var x = Array.from(document.querySelectorAll("style"));
            for (var i = x.length - 1; i >= 0; i--) {
              x[i].parentElement.removeChild(x[i]);
            }
          });
        }
      }
      if (options.inlineCss) {
        const minimalcssResult = await minimalcss.minimize({ urls: [url] });
        const cssText = minimalcssResult.finalCss;
        console.log("inline css", cssText.length);
        await page.evaluate(
          (cssText, preloadPolyfill) => {
            var head =
                document.head || document.getElementsByTagName("head")[0],
              style = document.createElement("style");
            style.type = "text/css";
            if (style.styleSheet) {
              style.styleSheet.cssText = cssText;
            } else {
              style.appendChild(document.createTextNode(cssText));
            }
            head.appendChild(style);

            var stylesheets = Array.from(
              document.querySelectorAll("link[rel=stylesheet]")
            );
            stylesheets.forEach(link => {
              // TODO: this doesn't work
              // var wrap = document.createElement('div');
              // wrap.appendChild(link.cloneNode(false));
              // var noscriptTag = document.createElement('noscript');
              // noscriptTag.innerHTML = wrap.innerHTML;
              // document.head.appendChild(noscriptTag);
              link.parentNode.removeChild(link);
              link.setAttribute("rel", "preload");
              link.setAttribute("as", "style");
              link.setAttribute("onload", "this.rel='stylesheet'");
              document.head.appendChild(link);
            });

            Array.from(document.querySelectorAll("script[src]")).forEach(x => {
              x.parentNode.removeChild(x);
              x.setAttribute("async", "true");
              document.head.appendChild(x);
            });

            var scriptTag = document.createElement("script");
            scriptTag.type = "text/javascript";
            scriptTag.text = preloadPolyfill;
            document.body.appendChild(scriptTag);
          },
          cssText,
          preloadPolyfill
        );
      }
      const filePath = path.join(destinationDir, route);
      if (options.saveAs === "html") {
        const content = await page.evaluate(
          () => document.documentElement.outerHTML
        );
        const minifiedContent = options.minifyOptions
          ? minify(content, options.minifyOptions)
          : content;
        if (filePath.endsWith("/")) {
          mkdirp.sync(filePath);
          fs.writeFileSync(path.join(filePath, "index.html"), minifiedContent);
        } else {
          mkdirp.sync(path.dirname(filePath));
          fs.writeFileSync(`${filePath}.html`, minifiedContent);
        }
      } else if (options.saveAs === "png") {
        mkdirp.sync(path.dirname(filePath));
        let screenshotPath;
        if (route === "/") {
          screenshotPath = `${filePath}/index.png`;
        } else {
          screenshotPath = `${filePath.replace(/\/$/, "")}.png`;
        }
        await page.screenshot({ path: screenshotPath });
      } else {
        throw new Error(`Unexpected value for saveAs: ${options.saveAs}`);
      }
      await page.close();
      console.log(`Crawled ${processed + 1} out of ${enqued} (${route})`);
    }
    processed++;
    if (enqued === processed) queue.end();
    return url;
  };

  fs
    .createReadStream(path.join(sourceDir, "index.html"))
    .pipe(fs.createWriteStream(path.join(sourceDir, "200.html")));
  const server = options.externalServer ? false : startServer(options);

  if (options.include) {
    options.include.map(x => addToQueue(`${basePath}${x}`));
  }
  queue
    .map(x => _(fetchPage(x)))
    .parallel(options.concurrency)
    .toArray(async function(urls) {
      await browser.close();
      if (!options.externalServer) server.close();
    });
};

exports.defaultOptions = defaultOptions;
exports.crawl = crawl;
