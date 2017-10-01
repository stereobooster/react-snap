#!/usr/bin/env node
const puppeteer = require("puppeteer");
const http = require("http");
const https = require("https");
const express = require("express");
const serveStatic = require("serve-static");
const fallback = require("express-history-api-fallback");
const path = require("path");
const Url = require("url");
const _ = require("highland");
const program = require("commander");
const fs = require("fs");
const mkdirp = require("mkdirp");
const minify = require("html-minifier").minify;

const crawl = options => {
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

  const buildDir = path.normalize(`${process.cwd()}/${options.build || "build"}`);
  const startServer = options => {
    const app = express()
      .use(serveStatic(buildDir))
      .use(fallback("index.html", { root: buildDir }));
    const server = http.createServer(app);
    server.listen(options.port);
    return server;
  };

  const basePath = `http://localhost:${options.port}/`;
  const basedomain = "localhost";
  const queue = _();
  let enqued = 0;
  let processed = 0;
  const uniqRegister = {};
  const addToQueue = (url, referer) => {
    if (Url.parse(url).hostname === basedomain && !uniqRegister[url]) {
      uniqRegister[url] = true;
      enqued++;
      queue.write(url);
    }
  };

  const fetchPage = async url => {
    if (shuttingDown) return;
    console.log(url);
    const browser = await puppeteer.launch();
    const page = await browser.newPage();
    await page.goto(url, { waitUntil: "networkidle" });
    const links = await page.evaluate(() =>
      Array.from(document.querySelectorAll("a")).map(link => link.href)
    );
    links.map(addToQueue);
    const content = await page.evaluate(
      () => document.documentElement.outerHTML
    );
    const route = url.replace(basePath, "");
    let filePath = path.join(buildDir, route);
    mkdirp.sync(filePath);
    const minifiedContent = minify(content, {
      minifyCSS: true,
      removeComments: true,
      collapseBooleanAttributes: true,
      collapseWhitespace: true,
      collapseInlineTagWhitespace: true,
      decodeEntities: true,
      keepClosingSlash: true,
      sortAttributes: true,
      sortClassName: true
    });
    fs.writeFileSync(path.join(filePath, "index.html"), minifiedContent);

    return browser.close().then(() => {
      processed++;
      if (enqued === processed) queue.end();
    });
  };

  const server = startServer(options);
  const url = options.url || `http://localhost:${options.port}/`;
  addToQueue(url);

  queue
    .map(x => _(fetchPage(x)))
    .parallel(options.concurrency)
    .collect()
    .done(function() {
      server.close();
    });
};

const { version } = require("./package.json");

program
  .version(version)
  .description("Prerender Create React App.")
  .option(
    "-p, --port [port]",
    "Temporary webserver port (Default: 45678)",
    45678
  )
  .option("-b, --build [build]", "Webserver root (Default: build)", "build")
  .option("-c, --concurrency [concurrency]", "Concurrency of crawler", 3)
  .option("--progress [progress]", "Show progress", true)
  .parse(process.argv);

crawl(program);
