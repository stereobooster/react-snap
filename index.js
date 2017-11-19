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
  removeBlobs: true,
  inlineCss: false, // experimental
  sourceMaps: false, // experimental
  preloadResources: false,
  headless: true,
  puppeteerArgs: [],
  userAgent: "ReactSnap",
  saveAs: "html",
  crawl: true,
  waitFor: false,
  externalServer: false,
  // workaround for https://github.com/geelen/react-snapshot/issues/66#issuecomment-331718560
  fixWebpackChunksIssue: true, // experimental
  bundleName: "main",
  skipThirdPartyRequests: false,
  asyncJs: false, //add async true to scripts and move them to the header, to start download earlier
  publicPath: "/",
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
  options.include = options.include.map(include =>
    path.normalize(options.publicPath + include)
  );
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
 * TODO: do we need to remove blobs for js?
 * @param {{page: Page}} opt
 * @return Promise
 */
const removeBlobs = async opt => {
  const { page } = opt;
  return page.evaluate(() => {
    var stylesheets = Array.from(
      document.querySelectorAll("link[rel=stylesheet]")
    );
    stylesheets.forEach(link => {
      if (link.href && link.href.startsWith("blob:")) {
        link.parentNode && link.parentNode.removeChild(link);
      }
    });
  });
};

/**
 * @param {{page: Page, pageUrl: string, options: {skipThirdPartyRequests: boolean, userAgent: string}, basePath: string, browser: Browser}} opt
 * @return {Promise}
 */
const inlineCss = async opt => {
  const { page, pageUrl, options, basePath, browser } = opt;
  const minimalcssResult = await minimalcss.minimize({
    urls: [pageUrl],
    skippable: request =>
      options.skipThirdPartyRequests && !request.url.startsWith(basePath),
    browser: browser,
    userAgent: options.userAgent
  });
  const cssText = minimalcssResult.finalCss;
  console.log("inline css", cssText.length);
  return page.evaluate(
    (cssText, preloadPolyfill) => {
      let head = document.head || document.getElementsByTagName("head")[0];
      let noscriptTags = document.getElementsByTagName('noscript');
      let noscript;
      if (noscriptTags.length === 0) {
        noscript = document.createElement('noscript');
        document.body.insertBefore(noscript, document.body.firstChild);
      } else {
        noscript = noscriptTags[0];
      }

      let style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode(cssText));
      head.appendChild(style);

      let stylesheets = Array.from(
        document.querySelectorAll("link[rel=stylesheet]")
      );
      stylesheets.forEach(link => {
        noscript.appendChild(link.cloneNode(false));

        link.parentNode && link.parentNode.removeChild(link);
        link.setAttribute("rel", "preload");
        link.setAttribute("as", "style");
        link.setAttribute("data-onload", "this.rel='stylesheet'");
        document.head.appendChild(link);
      });

      let scriptTag = document.createElement("script");
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

const fixWebpackChunksIssue = ({ page, basePath, bundleName, asyncJs }) => {
  return page.evaluate(
    (basePath, bundleName, asyncJs) => {
      const regexEscape = str => str.replace(/[-\/\\^$*+?.()|[\]{}]/g, '\\$&');
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      );
      
      const mainChunk = regexEscape(bundleName);
      const mainRegexp = new RegExp(mainChunk + ".[\\w]{8}.js");
      const mainScript = localScripts.filter(x => mainRegexp.test(x.src))[0];
      const chunkRegexp = /\.[\w]{8}\.chunk\.js/;
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
    bundleName,
    asyncJs
  );
};

const saveAsHtml = async ({ page, filePath, options, route }) => {
  let content = await page.content();
  content = content.replace('data-onload', 'onload');

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
      .use(options.publicPath, serveStatic(sourceDir))
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
    afterFetch: async ({ page, route, browser }) => {
      const pageUrl = `${basePath}${route}`;
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.removeBlobs) await removeBlobs({ page });
      if (options.inlineCss)
        await inlineCss({
          page,
          pageUrl,
          options,
          basePath,
          browser
        });
      if (options.fixWebpackChunksIssue) {
        await fixWebpackChunksIssue({
          page,
          basePath,
          bundleName: options.bundleName,
          asyncJs: options.asyncJs
        });
      } else if (options.asyncJs) {
        await asyncJs({ page });
      }
      const publicPath = options.publicPath.replace(/\/$/, "");
      const routePath = route.replace(publicPath, "");
      const filePath = path.join(destinationDir, routePath);
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
