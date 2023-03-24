require("setimmediate");

import {defaults} from "./defaults";
import {crawl} from "./puppeteer_utils";
import http from "http";
import express from "express";
import serveStatic from "serve-static";
import fallback from "express-history-api-fallback";
import path from "path";
import nativeFs from "fs";
import mkdirp from "mkdirp";
import {minify} from "html-minifier";
import url from "url";
import minimalcss from "minimalcss";
import CleanCSS from "clean-css";
import { round } from "lodash";
import {IInlineCssParams, IReactSnapOptions, ISaveAsParams, ReactSnapRunInfo, ICrawlParams} from "./model";

const {
  version
} = require(`../package.json`);

const normalizePath = path => (path === "/" ? "/" : path.replace(/\/$/, ""));

/**
 *
 * @param {{page: Page, basePath: string}} opt
 */
const preloadResources = (opt) => {
  const {
    page,
    preloadImages,
    cacheAjaxRequests,
    preconnectThirdParty,
    http2PushManifest,
    ignoreForPreload,
    basePath,
  } = opt;
  const ajaxCache = {};
  const http2PushManifestItems = [];
  const uniqueResources = new Set();
  page.on("response", async response => {
    const responseUrl = response.url();
    if (/^data:|blob:/i.test(responseUrl)) return;
    const ct = response.headers()["content-type"] || "";
    const route = responseUrl.replace(basePath, "");
    if (new RegExp(`^${basePath.replace(/:\d+$/, "")}`).test(responseUrl)) {
      if (uniqueResources.has(responseUrl)) return;
      if (preloadImages && /\.(png|jpg|jpeg|webp|gif|svg)$/.test(responseUrl)) {
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
        const fileName = url
          .parse(responseUrl)
          .pathname.split("/")
          .pop();
        if (!ignoreForPreload.includes(fileName)) {
          http2PushManifestItems.push({
            link: route,
            as: "style"
          });
        }
      }
      uniqueResources.add(responseUrl);
    } else if (preconnectThirdParty) {
      const urlObj = url.parse(responseUrl);
      const domain = `${urlObj.protocol}//${urlObj.host}`;
      if (uniqueResources.has(domain)) return;
      uniqueResources.add(domain);
      await page.evaluate(route => {
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preconnect");
        linkTag.setAttribute("href", route);
        document.head.appendChild(linkTag);
      }, domain);
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

const preloadPolyfill = nativeFs.readFileSync(
  path.normalize(`${__dirname}/../vendor/preload_polyfill.min.js`),
  "utf8"
);

/**
 *
 * @param {{page: Page}} opt
 * @return Promise
 */
const removeBlobs = async opt => {
  const { page } = opt;
  return page.evaluate(() => {
    const stylesheets = Array.from(
      document.querySelectorAll("link[rel=stylesheet]")
    ) as HTMLLinkElement[];
    stylesheets.forEach(link => {
      if (link.href && link.href.startsWith("blob:")) {
        link.parentNode && link.parentNode.removeChild(link);
      }
    });
  });
};


const getLinkFilename = (link, basePath) => {
    const [_, file] = link.match(new RegExp(`(${basePath}/[^ ]+)`)) ?? []

    return file;
}
/**
 *
 * @param {{page: Page, basePath: string}} opt
 * @param {Array<Array<string | null | object>>} logs
 * @return Promise
 */
const cleanPreloads = async (opt, logs) => {
  const { page } = opt;
    const unnecessaryPreloads = logs.flatMap(v => {
        return v
            .filter(v => typeof v === "string" && v.includes("was preloaded using link preload but not used") && !v.includes(".json"))
            .map(v => {
                return getLinkFilename(v, opt.basePath);
            })
    }) || [];

  return page.evaluate((unnecessaryPreloads) => {
    const preloads = Array.from(
      document.querySelectorAll("link[rel=preload]")
    ) as HTMLLinkElement[];

    preloads.forEach(link => {
      if (link.href && unnecessaryPreloads.some(preload => link.href.includes(preload))) {
        if (link.parentNode) link.parentNode.removeChild(link);
      }
    });
  }, unnecessaryPreloads);
};

/**
 * @param {{
     * page: Page,
     * pageUrl: string,
     * options: {minifyCss: object | boolean, leaveLinkCss: boolean, processCss: (page: Page, css: string, html: string, route: string, options: object) => Promise<string>, skipThirdPartyRequests: boolean, userAgent: string},
     * basePath: string,
     * route: string,
     * browser: Browser,
 * }} opt
 * @return {Promise}
 */
const inlineCss = async (opt: IInlineCssParams) => {
  const { page, pageUrl, options, basePath, route } = opt;

  let cssStrategy, cssSize, css, result;
  try {
      let minimalcssResult, criticalCss, criticalCssSize;

      try {
          if (options.minifyCss) {
              minimalcssResult = await minimalcss.minimize({
                urls: [pageUrl],
                skippable: request =>
                  options.skipThirdPartyRequests && !request.url().startsWith(basePath),
                browser: page.browser(),
                userAgent: options.userAgent
              });

              criticalCss = minimalcssResult.finalCss;
              criticalCssSize = Buffer.byteLength(criticalCss, "utf8");
          }
      } catch (e) {
          console.log(`🔥 Error when minimizing css on ${pageUrl}`, e)
      }

      result = await page.evaluate(async () => {
        const stylesheets = Array.from(
          document.querySelectorAll("link[rel=stylesheet]")
        ) as HTMLLinkElement[];
        const ignored = []
        const cssArray = await Promise.all(
          stylesheets.map(async link => {
          let response;
          try {
            response = await fetch(link.href);
          } catch (e) {
              ignored.push(link.href);
              console.log(`🔥 Error when fetching css from ${link.href}`, e)
          }
            return response ? response.text() : "";
          })
        );
        return {
          cssFiles: stylesheets.map(link => link.href).filter(link => !ignored.includes(link)),
          allCss: cssArray.join("")
        };
      });

      const allCss = (await (new CleanCSS((options.minifyCss || {}) as CleanCSS.OptionsOutput).minify(result.allCss))).styles;
      const allCssSize = Buffer.byteLength(allCss, "utf8");

      if (!criticalCssSize || criticalCssSize * 2 >= allCssSize) {
        cssStrategy = "inline";
        cssSize = allCssSize;
        css = allCss;
      } else {
        cssStrategy = "critical";
        cssSize = criticalCssSize;
        css = criticalCss;
      }

      if (options.processCss) {
          const {content} = await getPageContentAndTitle({page, route, options}, "css")

          css = await options.processCss(page, css, content, route, options);
          cssSize = Buffer.byteLength(css, "utf8");
      }

      if (cssSize > (options.warnOnInlineCssKb * 1024)) {
        console.log(
          `⚠️  warning: inlining CSS more than 20kb (${round(cssSize /
            1024, 2)}kb, ${round(allCssSize /
            1024, 2)}kb before processing, ${cssStrategy}, ${route})`
        );
      }

      if (cssStrategy === "critical") {
        await page.evaluate(
          (css, preloadPolyfill) => {
            const head = document.head || document.getElementsByTagName("head")[0],
              style = document.createElement("style");
            style.type = "text/css";
            style.appendChild(document.createTextNode(css));
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
          css,
          preloadPolyfill
        );
      } else {
        await page.evaluate((css, leaveLinkCss) => {
          if (!css) return;

          const head = document.head || document.getElementsByTagName("head")[0],
            style = document.createElement("style");
          style.type = "text/css";
          style.appendChild(document.createTextNode(css));

          if (!head) throw new Error("No <head> element found in document");

          head.appendChild(style);

          if (!leaveLinkCss) {
              const stylesheets = Array.from(
                document.querySelectorAll("link[rel=stylesheet]")
              );
              stylesheets.forEach(link => {
                  link.parentNode && link.parentNode.removeChild(link);
              });
          }
        }, css, !!options.leaveLinkCss);
      }

  } catch (e) {
      console.log(`🔥 Error when inlining css at ${pageUrl}`, e)
  }
  return {
    cssFiles: (result && cssStrategy === "inline") ? result.cssFiles : []
  };
};

const asyncScriptTags = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("script[src]")).forEach(x => {
      x.setAttribute("async", "true");
    });
  });
};

const fixWebpackChunksIssue1 = ({
  page,
  basePath,
  http2PushManifest,
  inlineCss
}) => {
  return page.evaluate(
    (basePath, http2PushManifest, inlineCss) => {
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      );
      // CRA v1|v2.alpha
      const mainRegexp = /main\.[\w]{8}.js|main\.[\w]{8}\.chunk\.js/;
      const mainScript = localScripts.find(x => mainRegexp.test(x.src));
      const firstStyle = document.querySelector("style");

      if (!mainScript) return;

      const chunkRegexp = /(\w+)\.[\w]{8}(\.chunk)?\.js/g;
      const chunkScripts = localScripts.filter(x => {
        const matched = chunkRegexp.exec(x.src);
        // we need to reset state of RegExp https://stackoverflow.com/a/11477448
        chunkRegexp.lastIndex = 0;
        return matched && matched[1] !== "main" && matched[1] !== "vendors";
      });

      const mainScripts = localScripts.filter(x => {
        const matched = chunkRegexp.exec(x.src);
        // we need to reset state of RegExp https://stackoverflow.com/a/11477448
        chunkRegexp.lastIndex = 0;
        return matched && (matched[1] === "main" || matched[1] === "vendors");
      });

      const createLink = x => {
        if (http2PushManifest) return;
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preload");
        linkTag.setAttribute("as", "script");
        linkTag.setAttribute("href", x.src.replace(basePath, ""));
        if (inlineCss) {
          firstStyle.parentNode.insertBefore(linkTag, firstStyle);
        } else {
          document.head.appendChild(linkTag);
        }
      };

      mainScripts.map(x => createLink(x));
      for (let i = chunkScripts.length - 1; i >= 0; --i) {
        const x = chunkScripts[i];
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          createLink(x);
        }
      }
    },
    basePath,
    http2PushManifest,
    inlineCss
  );
};

const fixWebpackChunksIssue2 = ({
  page,
  basePath,
  http2PushManifest,
  inlineCss
}) => {
  return page.evaluate(
    (basePath, http2PushManifest, inlineCss) => {
      const localScripts = Array.from(document.scripts).filter(
        x => x.src && x.src.startsWith(basePath)
      ) as HTMLScriptElement[];
      // CRA v2
      const mainRegexp = /main\.[\w]{8}\.chunk\.js/;
      const mainScript = localScripts.find(x => mainRegexp.test(x.src));
      const firstStyle = document.querySelector("style");

      if (!mainScript) return;

      const chunkRegexp = /(\w+)\.[\w]{8}\.chunk\.js/g;

      const headScripts = (Array.from(document.querySelectorAll("head script")) as HTMLScriptElement[])
        .filter(x => x.src && x.src.startsWith(basePath))
        .filter(x => {
          const matched = chunkRegexp.exec(x.src);
          // we need to reset state of RegExp https://stackoverflow.com/a/11477448
          chunkRegexp.lastIndex = 0;
          return matched;
        });

      const chunkScripts = localScripts.filter(x => {
        const matched = chunkRegexp.exec(x.src);
        // we need to reset state of RegExp https://stackoverflow.com/a/11477448
        chunkRegexp.lastIndex = 0;
        return matched;
      });

      const createLink = x => {
        if (http2PushManifest) return;
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preload");
        linkTag.setAttribute("as", "script");
        linkTag.setAttribute("href", x.src.replace(basePath, ""));
        if (inlineCss) {
          firstStyle.parentNode.insertBefore(linkTag, firstStyle);
        } else {
          document.head.appendChild(linkTag);
        }
      };

      for (let i = headScripts.length; i <= chunkScripts.length - 1; i++) {
        const x = chunkScripts[i];
        if (x.parentElement && mainScript.parentNode) {
          createLink(x);
        }
      }

      for (let i = headScripts.length - 1; i >= 0; --i) {
        const x = headScripts[i];
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          createLink(x);
        }
      }
    },
    basePath,
    http2PushManifest,
    inlineCss
  );
};

const fixParcelChunksIssue = ({
  page,
  basePath,
  http2PushManifest,
  inlineCss
}) => {
  return page.evaluate(
    (basePath, http2PushManifest, inlineCss) => {
      const localScripts = Array.from(document.scripts)
        .filter(x => x.src && x.src.startsWith(basePath))

      const mainRegexp = /main\.[\w]{8}\.js/;
      const mainScript = localScripts.find(x => mainRegexp.test(x.src));
      const firstStyle = document.querySelector("style");

      if (!mainScript) return;

      const chunkRegexp = /(\w+)\.[\w]{8}\.js/g;
      const chunkScripts = localScripts.filter(x => {
        const matched = chunkRegexp.exec(x.src);
        // we need to reset state of RegExp https://stackoverflow.com/a/11477448
        chunkRegexp.lastIndex = 0;
        return matched && matched[1] !== "main";
      });

      const createLink = x => {
        if (http2PushManifest) return;
        const linkTag = document.createElement("link");
        linkTag.setAttribute("rel", "preload");
        linkTag.setAttribute("as", "script");
        linkTag.setAttribute("href", x.src.replace(`${basePath}/`, ""));
        if (inlineCss) {
          firstStyle.parentNode.insertBefore(linkTag, firstStyle);
        } else {
          document.head.appendChild(linkTag);
        }
      };

      for (let i = 0; i <= chunkScripts.length - 1; i++) {
        const x = chunkScripts[i];
        if (x.parentElement && mainScript.parentNode) {
          x.parentElement.removeChild(x);
          createLink(x);
        }
      }
    },
    basePath,
    http2PushManifest,
    inlineCss
  );
};

const fixInsertRule = ({ page }) => {
  return page.evaluate(() => {
    Array.from(document.querySelectorAll("style")).forEach(style => {
      if (style.innerHTML === "") {
        style.innerHTML = Array.from(style.sheet.rules)
          .map(rule => rule.cssText)
          .join("");
      }
    });
  });
};

const fixFormFields = ({ page }) => {
  return page.evaluate(() => {
    (Array.from(document.querySelectorAll("[type=radio]")) as HTMLInputElement[]).forEach(element => {
      if (element.checked) {
        element.setAttribute("checked", "checked");
      } else {
        element.removeAttribute("checked");
      }
    });
    (Array.from(document.querySelectorAll("[type=checkbox]")) as HTMLInputElement[]).forEach(
      element => {
        if (element.checked) {
          element.setAttribute("checked", "checked");
        } else {
          element.removeAttribute("checked");
        }
      }
    );
    Array.from(document.querySelectorAll("option")).forEach(element => {
      if (element.selected) {
        element.setAttribute("selected", "selected");
      } else {
        element.removeAttribute("selected");
      }
    });
  });
};

const getPageContentAndTitle = async ({page, route, options}, process) => {
    if (options.processPage) {
        return await options.processPage(page, route, options, process);
    }

    let content = await page.content();
    content = content.replace(/react-snap-onload/g, "onload");
    const title = await page.title();
    const minifiedContent = options.minifyHtml
        ? minify(content, options.minifyHtml)
        : content;

    return { content: minifiedContent, title };
}

const saveAsHtml = async ({ page, filePath, options, route, fs }: ISaveAsParams) => {
  let {content, title} = await getPageContentAndTitle({ page, route, options }, "html");

  if (options.processHtml) {
      content = await options.processHtml(content, route, options)
  }

  filePath = filePath.replace(/\//g, path.sep);

  if (route.endsWith(".html")) {
    if (route.endsWith("/404.html") && !title.includes("404"))
      console.log('⚠️  warning: 404 page title does not contain "404" string');
    mkdirp.sync(path.dirname(filePath));
    fs.writeFileSync(filePath, content);
  } else {
    if (title.includes("404"))
      console.log(`⚠️  warning: page not found ${route}`);
    mkdirp.sync(filePath);
    filePath = path.join(filePath, `${options.fileName}.html`);

    fs.writeFileSync(filePath, content);
  }

  return filePath;
};

const saveAsPng = async ({ page, filePath, options, route }: ISaveAsParams) => {
  mkdirp.sync(path.dirname(filePath));
  let screenshotPath;
  if (route.endsWith(".html")) {
    screenshotPath = filePath.replace(/\.html$/, ".png");
  } else {
    screenshotPath = `${filePath}/${options.fileName}.png`;
  }
  await page.screenshot({ path: path.normalize(screenshotPath) });

  return screenshotPath;
};

const saveAsJpeg = async ({ page, filePath, options, route }: ISaveAsParams) => {
  mkdirp.sync(path.dirname(filePath));
  let screenshotPath;
  if (route.endsWith(".html")) {
    screenshotPath = filePath.replace(/\.html$/, ".jpeg");
  } else {
    screenshotPath = `${filePath}/${options.fileName}.jpeg`;
  }
  await page.screenshot({ path: path.normalize(screenshotPath) });

  return screenshotPath;
};

export const run = async (userOptions: IReactSnapOptions, { fs } = { fs: nativeFs }): Promise<ReactSnapRunInfo> => {
  let options;
  try {
    options = defaults(userOptions);
  } catch (e) {
    return Promise.reject(e.message);
  }

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

  const savingAsHtml = Array.isArray(options.saveAs) ? options.saveAs.includes("html") : options.saveAs === "html";

  if (
    destinationDir === sourceDir &&
      savingAsHtml &&
    fs.existsSync(path.join(sourceDir, "200.html"))
  ) {
    console.log(
      `🔥  200.html is present in the sourceDir (${sourceDir}). You can not run react-snap twice - this will break the build`
    );
    return Promise.reject("");
  }

  fs.createReadStream(path.join(sourceDir, "index.html")).pipe(
    fs.createWriteStream(path.join(sourceDir, "200.html"))
  );

  if (destinationDir !== sourceDir && savingAsHtml) {
    mkdirp.sync(destinationDir);
    fs.createReadStream(path.join(sourceDir, "index.html")).pipe(
      fs.createWriteStream(path.join(destinationDir, "200.html"))
    );
  }

  const server = options.externalServer ? null : startServer(options);

  const getFinalBasePath = options => {
    return [options.basePath, options.port].filter(v => !!v).join(":");
  }

  const basePath = getFinalBasePath(options);
  const publicPath = options.publicPath;
  const ajaxCache = {};
  const { http2PushManifest } = options;
  const http2PushManifestItems = {};

  console.log(`Crawling paths on ${basePath}${publicPath} with react-snap version: ${version}`)
  let redirects = [];
  let paths = [];

  const allLogs = await crawl({
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
        const { ajaxCache: ac, http2PushManifestItems: hpm } = preloadResources(
          {
            page,
            basePath,
            preloadImages,
            cacheAjaxRequests,
            preconnectThirdParty,
            http2PushManifest,
            ignoreForPreload: options.ignoreForPreload
          }
        );
        ajaxCache[route] = ac;
        http2PushManifestItems[route] = hpm;
      }
    },
    afterFetch: async ({ page, route, addToQueue, logs }) => {
      const pageUrl = `${basePath}${route}`;
      if (options.removeStyleTags) await removeStyleTags({ page });
      if (options.removeScriptTags) await removeScriptTags({ page });
      if (options.removeBlobs) await removeBlobs({ page });
      if (options.cleanPreloads) await cleanPreloads({ page, basePath }, logs);

      if (options.inlineCss) {
        const { cssFiles } = await inlineCss({
          page,
          pageUrl,
          options,
          basePath,
          route,
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

      if (options.fixWebpackChunksIssue === "Parcel") {
        await fixParcelChunksIssue({
          page,
          basePath,
          http2PushManifest,
          inlineCss: options.inlineCss
        });
      } else if (options.fixWebpackChunksIssue === "CRA2") {
        await fixWebpackChunksIssue2({
          page,
          basePath,
          http2PushManifest,
          inlineCss: options.inlineCss
        });
      } else if (options.fixWebpackChunksIssue === "CRA1") {
        await fixWebpackChunksIssue1({
          page,
          basePath,
          http2PushManifest,
          inlineCss: options.inlineCss
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

      let routePath = route.replace(publicPath, "");
      let filePath = path.join(destinationDir, routePath);
      if (Array.isArray(options.saveAs) ? options.saveAs.includes("html") : options.saveAs === "html") {
        paths.push(await saveAsHtml({ page, filePath, options, route, fs }));

        let newRoute = await page.evaluate(() => location.toString());
        newRoute = normalizePath(
          newRoute.replace(publicPath, "").replace(basePath, "")
        );
        routePath = normalizePath(routePath);

        if (routePath !== newRoute) {
          console.log(newRoute)
          const redirect = `${routePath} -> ${newRoute}`;
          redirects.push(redirect);
          console.log(`💬  in browser redirect (${redirect})`);
          await addToQueue(`${basePath}${publicPath}${newRoute}`);
        }
      }

      if (Array.isArray(options.saveAs) ? options.saveAs.includes("png") : options.saveAs === "png") {
        paths.push(await saveAsPng({ page, filePath, options, route, fs }));
      }

      if (Array.isArray(options.saveAs) ? (options.saveAs.includes("jpg") || options.saveAs.includes("jpeg")) : (options.saveAs === "jpg" || options.saveAs === "jpeg")) {
        paths.push(await saveAsJpeg({ page, filePath, options, route, fs }));
      }
    },
    onEnd: () => {
      if (server) server.close();
      if (http2PushManifest) {
        const manifest = Object.keys(http2PushManifestItems).reduce(
          (accumulator, key) => {
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
          },
          []
        );
        fs.writeFileSync(
          `${destinationDir}/http2-push-manifest.json`,
          JSON.stringify(manifest)
        );
      }
    }
  });

  return [paths, allLogs];
};

export {IReactSnapOptions, ReactSnapRunInfo};