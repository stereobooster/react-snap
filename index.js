#!/usr/bin/env node
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

const crawl = async options => {
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

  const buildDir = path.normalize(`${process.cwd()}/${options.build}`);
  const startServer = options => {
    const app = express()
      .use(serveStatic(buildDir))
      .use(fallback("200.html", { root: buildDir }));
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
  const browser = await puppeteer.launch({ headless: options.headless });
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
      page.on("requestfailed", msg =>
        console.log(`${route} requestfailed:`, msg)
      );
      await page.setUserAgent("ReactSnap");
      await page.goto(url, { waitUntil: "networkidle" });
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
      if (options.minimalCss) {
        const css = await page.evaluate(() =>
          Array.from(document.querySelectorAll("link[rel=stylesheet]")).map(
            link => link.href
          )
        );
        css.map(x => cssLinks.add(x));
      }
      if (options.inlineCss) {
        const cssText = await minimalcss
          .minimize({ urls: [url] })
          .then(result => {
            console.log("inline css", result.finalCss.length);
            return result.finalCss;
          });
        await page.evaluate(cssText => {
          var head = document.head || document.getElementsByTagName("head")[0],
            style = document.createElement("style");
          style.type = "text/css";
          if (style.styleSheet) {
            style.styleSheet.cssText = cssText;
          } else {
            style.appendChild(document.createTextNode(cssText));
          }
          head.appendChild(style);
        }, cssText);
      }
      const content = await page.evaluate(
        () => document.documentElement.outerHTML
      );
      const filePath = path.join(buildDir, route);
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
      await page.close();
      console.log(`Crawled ${processed + 1} out of ${enqued} (${route})`);
    }
    processed++;
    if (enqued === processed) queue.end();
    return url;
  };

  fs
    .createReadStream(path.join(buildDir, "index.html"))
    .pipe(fs.createWriteStream(path.join(buildDir, "200.html")));
  const server = startServer(options);

  addToQueue(`${basePath}/`);
  if (options.include) {
    options.include.map(x => addToQueue(`${basePath}${x}`));
  }
  queue
    .map(x => _(fetchPage(x)))
    .parallel(options.concurrency)
    .toArray(async function(urls) {
      if (options.minimalCss) {
        await minimalcss.minimize({ urls }).then(result => {
          console.log("minimal css", result.finalCss.length);
          if (cssLinks.values.length !== 1) return;
          const url = cssLinks.values[0];
          if (url.indexOf(basePath) !== 0) return;
          const route = url.replace(basePath, "");
          const filePath = path.join(buildDir, route);
          fs.writeFileSync(filePath, result.finalCss);
        });
      }
      await browser.close();
      server.close();
    });
};

const { reactSnap } = require(`${process.cwd()}/package.json`);

const options = {
  port: 45678,
  build: "build",
  concurrency: 4,
  viewport: false,
  include: ["/404"],
  removeStyleTags: false,
  minimalCss: false, // experimental
  inlineCss: false, // experimental
  sourceMaps: false, // experimental
  headless: true,
  minifyOptions: {
    minifyCSS: true,
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    collapseInlineTagWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    sortAttributes: true,
    sortClassName: true
  },
  ...reactSnap
};

crawl(options);
