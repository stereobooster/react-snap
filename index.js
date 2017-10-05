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
// TODO: use penthouse instead of critical

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
  const browser = await puppeteer.launch();
  const fetchPage = async url => {
    if (shuttingDown) return;
    const page = await browser.newPage();
    if (options.viewport) {
      await page.setViewport(options.viewport);
    }
    page.on("console", msg => console.log(msg));
    page.on("error", msg => console.log(msg));
    page.on("pageerror", msg => console.log(msg));
    await page.exposeFunction("reactSnap", msg => console.log(msg));
    await page.setUserAgent("ReactSnap");
    await page.goto(url, { waitUntil: "networkidle" });
    const anchors = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map(anchor => anchor.href)
    );
    anchors.map(addToQueue);
    const iframes = await page.evaluate(() =>
      Array.from(document.querySelectorAll("iframe")).map(iframe => iframe.src)
    );
    iframes.map(addToQueue);
    const content = await page.evaluate(
      () => document.documentElement.outerHTML
    );
    const route = url.replace(basePath, "");
    let filePath = path.join(buildDir, route);
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
    console.log(`Crawled ${processed + 1} out of ${enqued} (/${route})`);
    processed++;
    if (enqued === processed) queue.end();
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
    .collect()
    .done(async function() {
      server.close();
      await browser.close();
    });
};

const { reactSnap } = require(`${process.cwd()}/package.json`);

const options = {
  port: 45678,
  build: "build",
  concurrency: 3,
  viewport: false,
  include: ["/404"],
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
