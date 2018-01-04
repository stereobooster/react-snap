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
  puppeteerExecutablePath: undefined,
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
  sourceMaps: true,
  //# workarounds
  fixWebpackChunksIssue: true,
  removeBlobs: true,
  fixInsertRule: true,
  skipThirdPartyRequests: false,
  cacheAjaxRequests: false,
  http2PushManifest: false,
  // may use some glob solution in the future, if required
  // works when http2PushManifest: true
  ignoreForPreload: ["service-worker.js"],
  //# unstable configurations
  preconnectThirdParty: true,
  // Experimental. This config stands for two strategies inline and critical.
  // TODO: inline strategy can contain errors, like, confuse relative urls
  inlineCss: false,
  //# feature creeps to generate screenshots
  saveAs: "html",
  crawl: true,
  waitFor: false,
  externalServer: false,
  //# even more workarounds
  removeStyleTags: false,
  preloadImages: false,
  // add async true to script tags
  asyncScriptTags: false,
  //# another feature creep
  // tribute to Netflix Server Side Only React https://twitter.com/NetflixUIE/status/923374215041912833
  // but this will also remove code which registers service worker
  removeScriptTags: false,
  base: ""
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
  if (options.saveAs !== "html" && options.saveAs !== "png") {
    console.log("⚠️  saveAs supported values are html and png");
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
    preconnectThirdParty,
    http2PushManifest,
    ignoreForPreload
  } = opt;
  const ajaxCache = {};
  const http2PushManifestItems = [];
  const uniqueResources = new Set();
  page.on("response", async response => {
    const responseUrl = response.url;
    if (/^data:/i.test(responseUrl)) return;
    const ct = response.headers["content-type"] || "";
    const route = responseUrl.replace(basePath, "");
    if (/^http:\/\/localhost/i.test(responseUrl)) {
      if (uniqueResources.has(responseUrl)) return;
      if (preloadImages && /\.(png|jpg|jpeg|webp|gif)$/.test(responseUrl)) {
        if (http2PushManifest) {
          http2PushManifestItems.push({
            link: route,
            as: "image"
          });
        } else {
          await page.evaluate(route => {
            const linkTag = document.createElement("link");
            linkTag.setAttribute("rel", "preload");
            linkTag.setAttribute("as", "image");
            linkTag.setAttribute("href", route);
            document.body.appendChild(linkTag);
          }, route);
        }
      } else if (cacheAjaxRequests && ct.includes("json")) {
        const json = await response.json();
        ajaxCache[route] = json;
      } else if (http2PushManifest && /\.(js)$/.test(responseUrl)) {
        const fileName = url
          .parse(responseUrl)
          .pathname.split("/")
          .pop();
        if (!ignoreForPreload.includes(fileName)) {
          http2PushManifestItems.push({
            link: route,
            as: "script"
          });
        }
      } else if (http2PushManifest && /\.(css)$/.test(responseUrl)) {
        http2PushManifestItems.push({
          link: route,
          as: "style"
        });
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
  return { ajaxCache, http2PushManifestItems };
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
    return {
      cssFiles: stylesheets.map(link => link.href),
      allCss: cssArray.join("")
    };
  });
  const allCss = new CleanCSS(options.minifyCss).minify(result.allCss).styles;
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
    await page.evaluate(
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
    await page.evaluate(allCss => {
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
  return {
    cssFiles: cssStrategy === "inline" ? result.cssFiles : []
  };
};

const asyncScriptTags = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("script[src]")).forEach(x => {
      x.setAttribute("async", "true");
    });
  });
};

const fixWebpackChunksIssue = ({ page, basePath, http2PushManifest, base }) => {
  return page.evaluate(
    (basePath, http2PushManifest, base) => {
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      );
      const mainRegexp = /main\.[\w]{8}.js/;
      const mainScript = localScripts.filter(x => mainRegexp.test(x.src))[0];

      if (!mainScript) return;

      const chunkRegexp = /\.[\w]{8}\.chunk\.js/;
      const chunkSripts = localScripts.filter(x => chunkRegexp.test(x.src));

      const createLink = x => {
        if (http2PushManifest) return;
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preload");
        linkTag.setAttribute("as", "script");
        linkTag.setAttribute("href", x.src.replace(basePath, base));
        document.head.appendChild(linkTag);
      };

      createLink(mainScript);
      for (let i = chunkSripts.length - 1; i >= 0; --i) {
        const x = chunkSripts[i];
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          createLink(x);
        }
      }
    },
    basePath,
    http2PushManifest,
    base
  );
};

const fixInsertRule = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("style")).forEach(style => {
      if (style.innerText === "") {
        style.innerText = Array.from(style.sheet.rules)
          .map(rule => rule.cssText)
          .join("");
      }
    });
  });
};

const fixFormFields = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("[type=radio]")).forEach(element => {
      if (element.checked) {
        element.setAttribute("checked", "checked");
      } else {
        element.removeAttribute("checked");
      }
    });
    Array.from(
      document.querySelectorAll("[type=checkbox]")
    ).forEach(element => {
      if (element.checked) {
        element.setAttribute("checked", "checked");
      } else {
        element.removeAttribute("checked");
      }
    });
    Array.from(document.querySelectorAll("option")).forEach(element => {
      if (element.selected) {
        element.setAttribute("selected", "selected");
      } else {
        element.removeAttribute("selected");
      }
    });
  });
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
  const { http2PushManifest } = options;
  const http2PushManifestItems = {};

  await crawl({
    options,
    basePath,
    publicPath,
    sourceDir,
    beforeFetch: async ({ page, route }) => {
      const {
        preloadImages,
        cacheAjaxRequests,
        preconnectThirdParty
      } = options;
      if (
        preloadImages ||
        cacheAjaxRequests ||
        preconnectThirdParty ||
        http2PushManifest
      ) {
        const {
          ajaxCache: ac,
          http2PushManifestItems: hpm
        } = preloadResources({
          page,
          basePath,
          preloadImages,
          cacheAjaxRequests,
          preconnectThirdParty,
          http2PushManifest,
          ignoreForPreload: options.ignoreForPreload
        });
        ajaxCache[route] = ac;
        http2PushManifestItems[route] = hpm;
      }
    },
    afterFetch: async ({ page, route, browser }) => {
      const pageUrl = `${basePath}${route}`;
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.removeScriptTags) await removeScriptTags({ page });
      if (options.removeBlobs) await removeBlobs({ page });
      if (options.inlineCss) {
        const { cssFiles } = await inlineCss({
          page,
          pageUrl,
          options,
          basePath,
          browser
        });

        if (http2PushManifest) {
          const filesToRemove = cssFiles
            .filter(file => file.startsWith(basePath))
            .map(file => file.replace(basePath, ""));

          for (let i = http2PushManifestItems[route].length - 1; i >= 0; i--) {
            const x = http2PushManifestItems[route][i];
            filesToRemove.forEach(fileToRemove => {
              if (x.link.startsWith(fileToRemove)) {
                http2PushManifestItems[route].splice(i, 1);
              }
            });
          }
        }
      }
      if (options.fixWebpackChunksIssue) {
        await fixWebpackChunksIssue({
          page,
          basePath,
          http2PushManifest,
          base: options.base
        });
      }
      if (options.asyncScriptTags) await asyncScriptTags({ page });

      await page.evaluate(ajaxCache => {
        const snapEscape = (() => {
          const UNSAFE_CHARS_REGEXP = /[<>\/\u2028\u2029]/g;
          // Mapping of unsafe HTML and invalid JavaScript line terminator chars to their
          // Unicode char counterparts which are safe to use in JavaScript strings.
          const ESCAPED_CHARS = {
            "<": "\\u003C",
            ">": "\\u003E",
            "/": "\\u002F",
            "\u2028": "\\u2028",
            "\u2029": "\\u2029"
          };
          const escapeUnsafeChars = unsafeChar => ESCAPED_CHARS[unsafeChar];
          return str => str.replace(UNSAFE_CHARS_REGEXP, escapeUnsafeChars);
        })();
        // TODO: as of now it only prevents XSS attack,
        // but can stringify only basic data types
        // e.g. Date, Set, Map, NaN won't be handled right
        const snapStringify = obj => snapEscape(JSON.stringify(obj));

        let scriptTagText = "";
        if (ajaxCache && Object.keys(ajaxCache).length > 0) {
          scriptTagText += `window.snapStore=${snapEscape(
            JSON.stringify(ajaxCache)
          )};`;
        }
        let state;
        if (
          window.snapSaveState &&
          (state = window.snapSaveState()) &&
          Object.keys(state).length !== 0
        ) {
          scriptTagText += Object.keys(state)
            .map(key => `window["${key}"]=${snapStringify(state[key])};`)
            .join("");
        }
        if (scriptTagText !== "") {
          const scriptTag = document.createElement("script");
          scriptTag.type = "text/javascript";
          scriptTag.text = scriptTagText;
          const firstScript = Array.from(document.scripts)[0];
          firstScript.parentNode.insertBefore(scriptTag, firstScript);
        }
      }, ajaxCache[route]);
      delete ajaxCache[route];
      if (options.fixInsertRule) await fixInsertRule({ page });
      await fixFormFields({ page });

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
      if (http2PushManifest) {
        const manifest = Object.keys(
          http2PushManifestItems
        ).reduce((accumulator, key) => {
          if (http2PushManifestItems[key].length !== 0)
            accumulator.push({
              source: key,
              headers: [
                {
                  key: "Link",
                  value: http2PushManifestItems[key]
                    .map(x => `<${x.link}>;rel=preload;as=${x.as}`)
                    .join(",")
                }
              ]
            });
          return accumulator;
        }, []);
        fs.writeFileSync(
          `${destinationDir}/http2-push-manifest.json`,
          JSON.stringify(manifest)
        );
      }
    }
  });
};

exports.defaultOptions = defaultOptions;
exports.run = run;
