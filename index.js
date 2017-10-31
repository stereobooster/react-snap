const crawl = require("./src/puppeteer_utils.js").crawl;
const http = require("http");
const express = require("express");
const serveStatic = require("serve-static");
// @ts-ignore
const fallback = require("express-history-api-fallback");
const path = require("path");
const fs = require("fs");
const mkdirp = require("mkdirp");
const minify = require("html-minifier").minify;
const url = require("url");
// @ts-ignore https://github.com/peterbe/minimalcss/pull/30
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
  chunkRegexp: "([\\d]+)\\.[\\w]{8}\\.chunk\\.js", // experimental
  skipThirdPartyRequests: false,
  asyncJs: false, //add async true to scripts and move them to the header, to start download earlier
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

/**
 *
 * @param {{source: ?string, destination: ?string, include: ?Array<string>, sourceMaps: ?boolean, skipThirdPartyRequests: ?boolean }} userOptions
 * @return {*}
 */
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

/**
 *
 * @param {{page: Page, basePath: string}} opt
 */
const preloadResources = opt => {
  const { page, basePath } = opt;
  const uniqueResources = {};
  page.on("response", async response => {
    // TODO: this can be improved
    const responseUrl = response.url;
    if (/^data:/i.test(responseUrl)) return;
    const ct = response.headers["content-type"] || "";
    const route = responseUrl.replace(basePath, "");
    if (/^http:\/\/localhost/i.test(responseUrl)) {
      if (uniqueResources[responseUrl]) return;
      if (/\.(png|jpg|jpeg|webp|gif)$/.test(responseUrl)) {
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
      uniqueResources[responseUrl] = true;
    } else {
      const urlObj = url.parse(responseUrl);
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
      const ell = x[i];
      ell.parentElement && ell.parentElement.removeChild(ell);
    }
  });

const preloadPolyfill = fs.readFileSync(
  `${__dirname}/vendor/preload_polyfill.min.js`,
  "utf8"
);

/**
 * @param {{page: Page, pageUrl: string, options: {skipThirdPartyRequests: boolean}, basePath: string}} opt
 * @return {Promise}
 */
const inlineCss = async opt => {
  const { page, pageUrl, options, basePath } = opt;
  const minimalcssResult = await minimalcss.minimize({
    urls: [pageUrl],
    skippable: request =>
      options.skipThirdPartyRequests && !request.url.startsWith(basePath)
  });
  const cssText = minimalcssResult.finalCss;
  console.log("inline css", cssText.length);
  return page.evaluate(
    (cssText, preloadPolyfill) => {
      var head = document.head || document.getElementsByTagName("head")[0],
        style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode(cssText));
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
        link.parentNode && link.parentNode.removeChild(link);
        link.setAttribute("rel", "preload");
        link.setAttribute("as", "style");
        link.setAttribute("onload", "this.rel='stylesheet'");
        document.head.appendChild(link);
      });

      var scriptTag = document.createElement("script");
      scriptTag.type = "text/javascript";
      scriptTag.text = preloadPolyfill;
      // scriptTag.id = "preloadPolyfill";
      document.body.appendChild(scriptTag);
    },
    cssText,
    preloadPolyfill
  );
};

const asyncJs = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("script[src]")).forEach(x => {
      x.parentNode && x.parentNode.removeChild(x);
      x.setAttribute("async", "true");
      document.head.appendChild(x);
    });
  });
};

const fixWebpackChunksIssue = ({ page, basePath, asyncJs, options }) => {
  return page.evaluate(
    (basePath, asyncJs, options) => {
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      );
      const mainRegexp = /main\.[\w]{8}.js/;
      const mainScript = localScripts.filter(x => mainRegexp.test(x.src))[0];
      const chunkRegexp = new RegExp(options.chunkRegexp);
      const chunkSripts = localScripts.filter(x => chunkRegexp.test(x.src));
      chunkSripts.forEach(x => {
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          if (asyncJs) {
            x.setAttribute("async", "true");
          }
          mainScript.parentNode.insertBefore(x, mainScript.nextSibling);
        }
      });
    },
    basePath,
    asyncJs,
    options
  );
};

const saveAsHtml = async ({ page, filePath, options, route }) => {
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

const saveAsPng = ({ page, filePath, options, route }) => {
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

  if (destinationDir !== sourceDir && options.saveAs === "html") {
    mkdirp.sync(destinationDir);
    fs
      .createReadStream(path.join(sourceDir, "index.html"))
      .pipe(fs.createWriteStream(path.join(destinationDir, "200.html")));
  }

  const server = options.externalServer ? null : startServer(options);

  const basePath = `http://localhost:${options.port}`;
  await crawl({
    options,
    basePath,
    beforeFetch: async ({ page }) => {
      if (options.preloadResources) preloadResources({ page, basePath });
    },
    afterFetch: async ({ page, route }) => {
      const pageUrl = `${basePath}${route}`;
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.inlineCss)
        await inlineCss({
          page,
          pageUrl,
          options,
          basePath
        });
      if (options.fixWebpackChunksIssue) {
        await fixWebpackChunksIssue({
          page,
          basePath,
          asyncJs: options.asyncJs,
          options
        });
      } else if (options.asyncJs) {
        await asyncJs({ page });
      }
      const filePath = path.join(destinationDir, route);
      if (options.saveAs === "html") {
        await saveAsHtml({ page, filePath, options, route });
      } else if (options.saveAs === "png") {
        await saveAsPng({ page, filePath, options, route });
      } else {
        throw new Error(`Unexpected value for saveAs: ${options.saveAs}`);
      }
    },
    onEnd: () => {
      if (server) server.close();
    }
  });
};

exports.defaultOptions = defaultOptions;
exports.run = run;
