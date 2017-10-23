const crawl = require("./src/puppeteer_utils.js").crawl;
const http = require("http");
const express = require("express");
const serveStatic = require("serve-static");
const fallback = require("express-history-api-fallback");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const minify = require("html-minifier").minify;
const minimalcss = require("minimalcss");

const defaultOptions = {
  port: 45678,
  source: "build",
  destination: null,
  concurrency: 4,
  viewport: false,
  include: ["/", "/404"],
  removeStyleTags: false,
  inlineCss: false, // experimental
  sourceMaps: false, // experimental
  preloadResources: false,
  headless: true,
  userAgent: "ReactSnap",
  saveAs: "html",
  crawl: true,
  waitFor: false,
  externalServer: false,
  // workaround for https://github.com/geelen/react-snapshot/issues/66#issuecomment-331718560
  fixWebpackChunksIssue: false, // experimental
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

const defaults = userOptions => {
  const options = {
    ...defaultOptions,
    ...userOptions
  };
  options.destination = options.destination || options.source;
  if (!options.include || !options.include.length)
    throw new Error("include should be an array");
  return options;
};

const preloadResources = ({ page, basePath }) => {
  const uniqueResources = {};
  page.on("response", async response => {
    // TODO: this can be improved
    const url = response.url;
    if (/^data:/i.test(url)) return;
    const ct = response.headers["content-type"] || "";
    const route = url.replace(basePath, "");
    if (/^http:\/\/localhost/i.test(url)) {
      if (uniqueResources[url]) return;
      if (/\.(png|jpg|jpeg|webp)$/.test(url)) {
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
};

const removeStyleTags = ({ page }) =>
  page.evaluate(() => {
    var x = Array.from(document.querySelectorAll("style"));
    for (var i = x.length - 1; i >= 0; i--) {
      x[i].parentElement.removeChild(x[i]);
    }
  });

const preloadPolyfill = fs.readFileSync(
  `${__dirname}/vendor/preload_polyfill.min.js`,
  "utf8"
);

const inlineCss = async ({ page, url }) => {
  const minimalcssResult = await minimalcss.minimize({ urls: [url] });
  const cssText = minimalcssResult.finalCss;
  console.log("inline css", cssText.length);
  return page.evaluate(
    (cssText, preloadPolyfill) => {
      var head = document.head || document.getElementsByTagName("head")[0],
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

      // TODO: separate config for this
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
};

const fixWebpackChunksIssue = ({ page, basePath }) => {
  return page.evaluate(basePath => {
    const localScripts = Array.from(
      document.querySelectorAll("script[src]")
    ).filter(x => x.src.startsWith(basePath));
    const mainRegexp = /main\.[\w]{8}.js/;
    const mainScript = localScripts.filter(x => mainRegexp.test(x.src))[0];
    const chunkRegexp = /([\d]+)\.[\w]{8}\.chunk\.js/;
    const chunkSripts = localScripts.filter(x => chunkRegexp.test(x.src));
    chunkSripts.forEach(x => {
      x.parentElement.removeChild(x);
      mainScript.parentNode.insertBefore(x, mainScript.nextSibling);
    });
  }, basePath);
};

const saveAsHtml = async ({ page, filePath, options }) => {
  const content = await page.evaluate(() => document.documentElement.outerHTML);
  const minifiedContent = options.minifyOptions
    ? minify(content, options.minifyOptions)
    : content;
  filePath = filePath.replace(/\//g, path.sep);
  if (filePath.endsWith(path.sep)) {
    mkdirp.sync(filePath);
    fs.writeFileSync(path.join(filePath, "index.html"), minifiedContent);
  } else {
    mkdirp.sync(path.dirname(filePath));
    fs.writeFileSync(`${filePath}.html`, minifiedContent);
  }
};

const saveAsPng = ({ page, filePath, options }) => {
  mkdirp.sync(path.dirname(filePath));
  let screenshotPath;
  if (route === "/") {
    screenshotPath = `${filePath}/index.png`;
  } else {
    screenshotPath = `${filePath.replace(/\/$/, "")}.png`;
  }
  return page.screenshot({ path: screenshotPath });
};

const run = async userOptions => {
  const options = defaults(userOptions);

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

  fs
    .createReadStream(path.join(sourceDir, "index.html"))
    .pipe(fs.createWriteStream(path.join(sourceDir, "200.html")));
  const server = options.externalServer ? false : startServer(options);

  const basePath = `http://localhost:${options.port}`;
  await crawl({
    options,
    basePath,
    beforeFeth: async ({ page, route }) => {
      if (options.preloadResources) preloadResources({ page, basePath });
    },
    aferFeth: async ({ page, route }) => {
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.inlineCss) await inlineCss({ page, url });
      if (options.fixWebpackChunksIssue)
        await fixWebpackChunksIssue({ page, basePath });
      const filePath = path.join(destinationDir, route);
      if (options.saveAs === "html") {
        await saveAsHtml({ page, filePath, options });
      } else if (options.saveAs === "png") {
        await saveAsPng({ page, filePath, options });
      } else {
        throw new Error(`Unexpected value for saveAs: ${options.saveAs}`);
      }
    },
    onEnd: () => {
      if (!options.externalServer) server.close();
    }
  });
};

exports.defaultOptions = defaultOptions;
exports.run = run;
