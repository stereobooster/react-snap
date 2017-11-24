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
const CleanCSS = require("clean-css");
const twentyKb = 20 * 1024;

const defaultOptions = {
  //# stable configurations
  port: 45678,
  source: "build",
  destination: null,
  concurrency: 4,
  include: ["/"],
  userAgent: "ReactSnap",
  headless: true,
  puppeteerArgs: [],
  publicPath: "/",
  minifyCss: {},
  minifyHtml: {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    sortAttributes: true,
    sortClassName: true
  },
  // mobile first approach
  viewport: {
    width: 480,
    height: 850
  },
  //# feature creeps to generate screenshots
  saveAs: "html",
  crawl: true,
  waitFor: false,
  externalServer: false,
  //# workarounds
  fixWebpackChunksIssue: true,
  removeBlobs: true,
  skipThirdPartyRequests: false,
  asyncComponentsTrick: false,
  //# unstable configurations
  preconnectThirdParty: true,
  // Experimental. This config stands for two strategies inline and critical.
  // TODO: inline strategy can contain errors, like, confuse relative urls
  // TODO: critical strategy miss noscript fallback
  inlineCss: false,
  // Experimental. TODO: need to fix issues with sourcemaps
  sourceMaps: false,
  cacheAjaxRequests: false,
  //# even more workarounds
  removeStyleTags: false,
  preloadImages: false,
  // add async true to scripts and move them to the header, to start download earlier
  // can use <link rel="preload"> instead
  asyncScriptTags: false,
  //# another feature creep
  // tribute to Netflix Server Side Only React https://twitter.com/NetflixUIE/status/923374215041912833
  // but this will also remove code which registers service worker
  removeScriptTags: false
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

  let exit = false;
  if (options.preloadResources) {
    console.log(
      "⚠️  preloadResources option deprecated. Use preloadImages or cacheAjaxRequests"
    );
    exit = true;
  }
  if (options.minifyOptions) {
    console.log("⚠️  minifyOptions option renamed to minifyHtml");
    options.minifyHtml = options.minifyOptions;
  }
  if (options.asyncJs) {
    console.log("⚠️  asyncJs option renamed to asyncScriptTags");
    options.asyncScriptTags = options.asyncJs;
  }
  if (
    options.asyncComponentsTrick &&
    (options.asyncScriptTags || !options.fixWebpackChunksIssue)
  ) {
    console.log(
      "⚠️  asyncComponentsTrick requires asyncScriptTags=false and fixWebpackChunksIssue=true"
    );
    exit = true;
  }
  if (options.saveAs !== "html" && options.saveAs !== "png") {
    console.log("⚠️  saveAs supported values are html png");
    exit = true;
  }
  if (exit) process.exit(1);
  if (options.minifyHtml && !options.minifyHtml.minifyCSS) {
    options.minifyHtml.minifyCSS = options.minifyCss;
  }

  if (!options.publicPath.startsWith("/")) {
    options.publicPath = `/${options.publicPath}`;
  }
  options.publicPath = options.publicPath.replace(/\/$/, "");

  options.include = options.include.map(
    include => options.publicPath + include
  );
  return options;
};

/**
 *
 * @param {{page: Page, basePath: string}} opt
 */
const preloadResources = opt => {
  const {
    page,
    basePath,
    preloadImages,
    cacheAjaxRequests,
    preconnectThirdParty
  } = opt;
  const ajaxCache = {};
  const uniqueResources = new Set();
  page.on("response", async response => {
    const responseUrl = response.url;
    if (/^data:/i.test(responseUrl)) return;
    const ct = response.headers["content-type"] || "";
    const route = responseUrl.replace(basePath, "");
    if (/^http:\/\/localhost/i.test(responseUrl)) {
      if (uniqueResources.has(responseUrl)) return;
      if (preloadImages && /\.(png|jpg|jpeg|webp|gif)$/.test(responseUrl)) {
        await page.evaluate(route => {
          const linkTag = document.createElement("link");
          linkTag.setAttribute("rel", "preload");
          linkTag.setAttribute("as", "image");
          linkTag.setAttribute("href", route);
          document.body.appendChild(linkTag);
        }, route);
      } else if (cacheAjaxRequests && ct.includes("json")) {
        const json = await response.json();
        ajaxCache[route] = json;
      }
      uniqueResources.add(responseUrl);
    } else if (preconnectThirdParty) {
      const urlObj = url.parse(responseUrl);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      if (uniqueResources.has(domain)) return;
      await page.evaluate(route => {
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preconnect");
        linkTag.setAttribute("href", route);
        document.head.appendChild(linkTag);
      }, domain);
      uniqueResources.add(domain);
    }
  });
  return ajaxCache;
};

const removeStyleTags = ({ page }) =>
  page.evaluate(() => {
    Array.from(document.querySelectorAll("style")).forEach(ell => {
      ell.parentElement && ell.parentElement.removeChild(ell);
    });
  });

const removeScriptTags = ({ page }) =>
  page.evaluate(() => {
    Array.from(document.querySelectorAll("script")).forEach(ell => {
      ell.parentElement && ell.parentElement.removeChild(ell);
    });
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
    const stylesheets = Array.from(
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
  const criticalCss = minimalcssResult.finalCss;
  const criticalCssSize = Buffer.byteLength(criticalCss, "utf8");

  const result = await page.evaluate(async () => {
    const stylesheets = Array.from(
      document.querySelectorAll("link[rel=stylesheet]")
    );
    const cssArray = await Promise.all(
      stylesheets.map(async link => {
        const response = await fetch(link.href);
        return response.text();
      })
    );
    return cssArray.join("");
  });
  const allCss = new CleanCSS(options.minifyCss).minify(result).styles;
  const allCssSize = Buffer.byteLength(allCss, "utf8");

  let cssStrategy, cssSize;
  if (criticalCssSize * 2 >= allCssSize) {
    cssStrategy = "inline";
    cssSize = allCssSize;
  } else {
    cssStrategy = "critical";
    cssSize = criticalCssSize;
  }

  if (cssSize > twentyKb)
    console.log(
      `⚠️  inlining CSS more than 20kb (${cssSize / 1024}kb, ${cssStrategy})`
    );

  if (cssStrategy === "critical") {
    return page.evaluate(
      (criticalCss, preloadPolyfill) => {
        const head = document.head || document.getElementsByTagName("head")[0],
          style = document.createElement("style");
        style.type = "text/css";
        style.appendChild(document.createTextNode(criticalCss));
        head.appendChild(style);
        const noscriptTag = document.createElement("noscript");
        document.head.appendChild(noscriptTag);

        const stylesheets = Array.from(
          document.querySelectorAll("link[rel=stylesheet]")
        );
        stylesheets.forEach(link => {
          noscriptTag.appendChild(link.cloneNode(false));
          link.setAttribute("rel", "preload");
          link.setAttribute("as", "style");
          link.setAttribute("react-snap-onload", "this.rel='stylesheet'");
          document.head.appendChild(link);
        });

        const scriptTag = document.createElement("script");
        scriptTag.type = "text/javascript";
        scriptTag.text = preloadPolyfill;
        // scriptTag.id = "preloadPolyfill";
        document.body.appendChild(scriptTag);
      },
      criticalCss,
      preloadPolyfill
    );
  } else {
    return page.evaluate(allCss => {
      const head = document.head || document.getElementsByTagName("head")[0],
        style = document.createElement("style");
      style.type = "text/css";
      style.appendChild(document.createTextNode(allCss));
      head.appendChild(style);

      const stylesheets = Array.from(
        document.querySelectorAll("link[rel=stylesheet]")
      );
      stylesheets.forEach(link => {
        link.parentNode && link.parentNode.removeChild(link);
      });
    }, allCss);
  }
};

const asyncScriptTags = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("script[src]")).forEach(x => {
      x.parentNode && x.parentNode.removeChild(x);
      x.setAttribute("async", "true");
      document.head.appendChild(x);
    });
  });
};

const fixWebpackChunksIssue = ({ page, basePath, asyncComponentsTrick }) => {
  return page.evaluate(
    async (basePath, asyncComponentsTrick) => {
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      );
      const mainRegexp = /main\.[\w]{8}.js/;
      const mainScript = localScripts.filter(x => mainRegexp.test(x.src))[0];
      const chunkRegexp = /([\w]+)?\.[\w]{8}\.chunk\.js/;
      const chunkSripts = localScripts.filter(x => chunkRegexp.test(x.src));

      if (!mainScript && chunkSripts.length > 0) {
        throw new Error("There are chunks but cannot detect main bundle");
      }

      if (asyncComponentsTrick) {
        if (!mainScript)
          throw new Error("asyncComponentsTrick: cannot detect main bundle");
        const mainScriptSource = await (await fetch(mainScript.src)).text();
        if (!mainScriptSource.includes("window.snapGetComponentIds")) {
          throw new Error(
            "asyncComponentsTrick: you forgot to add window.snapGetComponentIds"
          );
        }
      }

      const createLink = x => {
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preload");
        linkTag.setAttribute("as", "script");
        linkTag.setAttribute("href", x.src.replace(basePath, ""));
        mainScript.parentNode.insertBefore(linkTag, mainScript.nextSibling);
      };

      for (let i = chunkSripts.length - 1; i >= 0; --i) {
        const x = chunkSripts[i];
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          createLink(x);
        }
      }
      if (asyncComponentsTrick) {
        const scriptTag = document.createElement("script");
        scriptTag.type = "text/javascript";
        scriptTag.text = `window.__LOADABLE_COMPONENT_IDS__ = ${JSON.stringify(
          window.snapGetComponentIds()
        )};`;
        mainScript.parentNode.insertBefore(scriptTag, mainScript);
      }
      createLink(mainScript);
    },
    basePath,
    asyncComponentsTrick
  );
};

const saveAsHtml = async ({ page, filePath, options, route }) => {
  let content = await page.content();
  content = content.replace(/react-snap-onload/g, "onload");
  const title = await page.title();
  const minifiedContent = options.minifyHtml
    ? minify(content, options.minifyHtml)
    : content;
  filePath = filePath.replace(/\//g, path.sep);
  if (route.endsWith(".html")) {
    if (route.endsWith("/404.html") && !title.includes("404"))
      console.log('⚠️  404 page title does not contain "404" string');
    mkdirp.sync(path.dirname(filePath));
    fs.writeFileSync(filePath, minifiedContent);
  } else {
    if (title.includes("404")) console.log(`⚠️  page not found ${route}`);
    mkdirp.sync(filePath);
    fs.writeFileSync(path.join(filePath, "index.html"), minifiedContent);
  }
};

const saveAsPng = ({ page, filePath, options, route }) => {
  mkdirp.sync(path.dirname(filePath));
  let screenshotPath;
  if (route.endsWith(".html")) {
    screenshotPath = filePath.replace(/\.html$/, ".png");
  } else if (route === "/") {
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

  if (
    destinationDir === sourceDir &&
    options.saveAs === "html" &&
    fs.existsSync(path.join(sourceDir, "200.html"))
  ) {
    console.log(
      `200.html is present in the sourceDir (${sourceDir}). You can not run react-snap twice - this will break the build`
    );
    process.exit(1);
  }

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
  const publicPath = options.publicPath;
  const ajaxCache = {};

  await crawl({
    options,
    basePath,
    publicPath,
    beforeFetch: async ({ page, route }) => {
      const {
        preloadImages,
        cacheAjaxRequests,
        preconnectThirdParty
      } = options;
      if (preloadImages || cacheAjaxRequests || preconnectThirdParty)
        ajaxCache[route] = preloadResources({
          page,
          basePath,
          preloadImages,
          cacheAjaxRequests,
          preconnectThirdParty
        });
    },
    afterFetch: async ({ page, route, browser }) => {
      const pageUrl = `${basePath}${route}`;
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.removeScriptTags) await removeScriptTags({ page });
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
          asyncComponentsTrick: options.asyncComponentsTrick
        });
      }
      if (ajaxCache[route] && Object.keys(ajaxCache[route]).length > 0) {
        await page.evaluate(ajaxCache => {
          const scriptTag = document.createElement("script");
          scriptTag.type = "text/javascript";
          scriptTag.text = `window.snapStore = ${JSON.stringify(ajaxCache)};`;
          const firstScript = Array.from(document.scripts)[0];
          firstScript.parentNode.insertBefore(scriptTag, firstScript);
        }, ajaxCache[route]);
        delete ajaxCache[route];
      }
      if (options.asyncScriptTags) await asyncScriptTags({ page });
      const routePath = route.replace(publicPath, "");
      const filePath = path.join(destinationDir, routePath);
      if (options.saveAs === "html") {
        await saveAsHtml({ page, filePath, options, route });
      } else if (options.saveAs === "png") {
        await saveAsPng({ page, filePath, options, route });
      }
    },
    onEnd: () => {
      if (server) server.close();
    }
  });
};

exports.defaultOptions = defaultOptions;
exports.run = run;
