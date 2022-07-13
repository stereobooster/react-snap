"use strict";
var __createBinding = (this && this.__createBinding) || (Object.create ? (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    var desc = Object.getOwnPropertyDescriptor(m, k);
    if (!desc || ("get" in desc ? !m.__esModule : desc.writable || desc.configurable)) {
      desc = { enumerable: true, get: function() { return m[k]; } };
    }
    Object.defineProperty(o, k2, desc);
}) : (function(o, m, k, k2) {
    if (k2 === undefined) k2 = k;
    o[k2] = m[k];
}));
var __setModuleDefault = (this && this.__setModuleDefault) || (Object.create ? (function(o, v) {
    Object.defineProperty(o, "default", { enumerable: true, value: v });
}) : function(o, v) {
    o["default"] = v;
});
var __importStar = (this && this.__importStar) || function (mod) {
    if (mod && mod.__esModule) return mod;
    var result = {};
    if (mod != null) for (var k in mod) if (k !== "default" && Object.prototype.hasOwnProperty.call(mod, k)) __createBinding(result, mod, k);
    __setModuleDefault(result, mod);
    return result;
};
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
exports.crawl = exports.makeCancelable = exports.getLinks = exports.enableLogging = exports.skipThirdPartyRequests = void 0;
const puppeteer_1 = __importStar(require("puppeteer"));
const puppeteer_cluster_1 = require("puppeteer-cluster");
const puppeteer_extra_1 = require("puppeteer-extra");
const puppeteer_extra_plugin_block_resources_1 = __importDefault(require("puppeteer-extra-plugin-block-resources"));
const url_1 = __importDefault(require("url"));
const path_1 = __importDefault(require("path"));
const fs_1 = __importDefault(require("fs"));
const tracker_1 = require("./tracker");
const mapStackTrace = require("sourcemapped-stacktrace-node").default;
const puppeteerWithExtra = (0, puppeteer_extra_1.addExtra)(puppeteer_1.default);
puppeteerWithExtra.use((0, puppeteer_extra_plugin_block_resources_1.default)({
    blockedTypes: new Set(['websocket']),
    interceptResolutionPriority: puppeteer_1.DEFAULT_INTERCEPT_RESOLUTION_PRIORITY,
}));
const errorToString = jsHandle => jsHandle.executionContext().evaluate(e => e.toString(), jsHandle);
const objectToJson = jsHandle => jsHandle.jsonValue();
/**
 * @param {{page: Page, options: {skipThirdPartyRequests: true}, basePath: string }} opt
 * @return {Promise<void>}
 */
const skipThirdPartyRequests = async (opt) => {
    const { page, options, basePath } = opt;
    if (!options.skipThirdPartyRequests)
        return;
    await page.setRequestInterception(true);
    page.on("request", request => {
        if (request.url().startsWith(basePath)) {
            request.continue();
        }
        else {
            request.abort();
        }
    });
};
exports.skipThirdPartyRequests = skipThirdPartyRequests;
/**
 * @param {{page: Page, options: {sourceMaps: boolean}, route: string, onError: ?function }} opt
 * @return {void}
 */
const enableLogging = (opt, logs = []) => {
    const { page, options, basePath, route, onError, sourcemapStore } = opt;
    page.on("console", msg => {
        const text = msg.text();
        if (text === "JSHandle@object") {
            Promise.all(msg.args().map(objectToJson)).then(args => {
                logs.push(args);
                console.log(`💬  console.log of JSHandle@object at ${route}:`, ...args);
            });
        }
        else if (text === "JSHandle@error") {
            Promise.all(msg.args().map(errorToString)).then(args => {
                logs.push(args);
                console.log(`💬  console.log of JSHandle@error at ${route}:`, ...args);
            });
        }
        else {
            const url = msg.location().url;
            const ignoreThirdPartyError = options.skipThirdPartyRequests && text.includes("ERR_FAILED") && url && url.includes("http") && !url.includes(options.basePath);
            if (ignoreThirdPartyError) {
                return;
            }
            if (!text.includes("[webpack-dev-server]") && !text.includes("WebSocket")) {
                logs.push([text, url]);
                if (!text.includes("was preloaded")) {
                    console.log(`️️️💬  console.log at ${route}:`, text, url);
                }
            }
        }
    });
    page.on("error", msg => {
        console.log(`🔥  error at ${route}:`, msg);
        logs.push([msg]);
        onError && onError();
    });
    page.on("pageerror", e => {
        if (options.sourceMaps) {
            mapStackTrace(e.stack || e.message, {
                isChromeOrEdge: true,
                store: sourcemapStore || {}
            })
                .then(result => {
                // TODO: refactor mapStackTrace: return array not a string, return first row too
                const stackRows = result.split("\n");
                const puppeteerLine = stackRows.findIndex(x => x.includes("puppeteer")) ||
                    stackRows.length - 1;
                const stackToUse = stackRows.length && puppeteerLine > 0 ?
                    `${(e.stack || e.message).split("\n")[0] + "\n"}${stackRows.slice(0, puppeteerLine).join("\n")}`
                    : (e.stack || e.message);
                const msg = `🔥  pageerror stack at ${route}: ${stackToUse}`;
                logs.push([msg]);
                console.log(msg);
            })
                .catch(e2 => {
                const msg = e;
                logs.push([msg]);
                console.log(`🔥  pageerror at ${route}:`, e.stack || e.message);
                console.log(`️️️⚠️  warning at ${route} (error in source maps):`, e2.message);
            });
        }
        else {
            const msg = e;
            logs.push([msg]);
            console.log(`🔥  pageerror pure at ${route}:`, e.stack || e.message);
        }
        if (e.message !== "Event" && !e.message.startsWith("TypeError")) {
            onError && onError();
        }
    });
    page.on("response", response => {
        if (response.status() >= 400) {
            let route = "";
            try {
                route = response.request()
                    .headers()
                    .referer.replace(basePath, "");
            }
            catch (e) { }
            const msg = `️️️⚠️  warning at ${route}: got ${response.status()} HTTP code for ${response.url()}`;
            logs.push([msg]);
            console.log(msg);
        }
    });
    // page.on("requestfailed", msg =>
    //   console.log(`️️️⚠️  ${route} requestfailed:`, msg)
    // );
};
exports.enableLogging = enableLogging;
/**
 * @param {{page: Page}} opt
 * @return {Promise<Array<string>>}
 */
const getLinks = async (opt) => {
    const { page } = opt;
    const anchors = await page.evaluate(() => Array.from(document.querySelectorAll("a,link[rel='alternate']")).map(anchor => {
        if (anchor.href.baseVal) {
            const a = document.createElement("a");
            a.href = anchor.href.baseVal;
            return a.href;
        }
        return anchor.href;
    }));
    const iframes = await page.evaluate(() => Array.from(document.querySelectorAll("iframe")).map(iframe => iframe.src));
    return anchors.concat(iframes);
};
exports.getLinks = getLinks;
const makeCancelable = (promise) => {
    let hasCanceled = false;
    const wrappedPromise = new Promise((resolve, reject) => {
        promise === null || promise === void 0 ? void 0 : promise.then(val => hasCanceled ? reject({ isCanceled: true }) : resolve(val), error => hasCanceled ? reject({ isCanceled: true }) : reject(error));
    });
    return {
        promise: wrappedPromise,
        cancel() {
            hasCanceled = true;
            wrappedPromise.catch(e => {
                if (e.isCanceled) {
                    return;
                }
                throw e;
            });
        },
    };
};
exports.makeCancelable = makeCancelable;
/**
 * @typedef UrlLogs
 * @property {string} url True if the token is valid.
 * @property {Array<Array<string>>} logs The user id bound to the token.
 */
/**
 * can not use null as default for function because of TS error https://github.com/Microsoft/TypeScript/issues/14889
 *
 * @param {{options: *, basePath: string, beforeFetch: ?(function({ page: Page, route: string }):Promise), afterFetch: ?(function({ page: Page, browser: Browser, route: string }):Promise), onEnd: ?(function():void)}} opt
 * @return {Promise<Array<UrlLogs>>}
 */
const crawl = async (opt) => {
    var _a;
    const { options, basePath, beforeFetch, afterFetch, onEnd, publicPath, sourceDir } = opt;
    const exclude = options.exclude;
    let shuttingDown = false;
    let streamClosed = false;
    const onSigint = () => {
        if (shuttingDown) {
            process.exit(1);
        }
        else {
            shuttingDown = true;
            console.log("\nGracefully shutting down. To exit immediately, press ^C again");
        }
    };
    process.on("SIGINT", onSigint);
    const onUnhandledRejection = error => {
        console.log("🔥  UnhandledPromiseRejectionWarning", error);
        if (!options.ignorePageErrors) {
            shuttingDown = true;
        }
    };
    process.on("unhandledRejection", onUnhandledRejection);
    let enqueued = 0;
    let processed = 0;
    let added404 = false;
    let allLogs = [];
    const basePathHostname = (_a = options.basePath) === null || _a === void 0 ? void 0 : _a.replace(/https?:\/\//, "");
    // use Set instead
    const uniqueUrls = new Set();
    const sourcemapStore = {};
    const cluster = await puppeteer_cluster_1.Cluster.launch({
        puppeteer: puppeteerWithExtra,
        concurrency: options.concurrencyType,
        maxConcurrency: options.concurrency,
        puppeteerOptions: {
            headless: options.headless,
            args: options.puppeteerArgs,
            executablePath: options.puppeteerExecutablePath,
            ignoreHTTPSErrors: options.puppeteerIgnoreHTTPSErrors,
            handleSIGINT: false
        }
    });
    /**
     * @param {string} newUrl
     * @returns {void}
     */
    const addToQueue = async (newUrl) => {
        const { hostname, search, hash, port, pathname } = url_1.default.parse(newUrl);
        newUrl = newUrl.replace(`${search || ""}${hash || ""}`, "");
        // Ensures that only link on the same port are crawled
        //
        // url.parse returns a string,
        // but options port is passed by a user and default value is a number
        // we are converting both to string to be sure
        // Port can be null, therefore we need the null check
        const isOnAppPort = (!port && !options.port) || (port && port.toString() === options.port.toString());
        if (exclude.filter(regex => regex.test(pathname)).length > 0)
            return;
        if (basePathHostname === hostname && isOnAppPort && !uniqueUrls.has(newUrl) && !streamClosed) {
            uniqueUrls.add(newUrl);
            enqueued++;
            await cluster.queue(newUrl);
            if (enqueued > 1 && options.crawl && !added404) {
                added404 = true;
                await addToQueue(`${basePath}${publicPath}/404.html`);
            }
        }
    };
    let waitForIdle = (0, exports.makeCancelable)(Promise.resolve());
    /**
     * @param {string} pageUrl
     * @returns {Promise<UrlLogs>}
     */
    const fetchPage = async (page, pageUrl) => {
        const route = pageUrl.replace(basePath, "");
        let skipExistingFile = false;
        const routePath = route.replace(/\//g, path_1.default.sep);
        const { ext } = path_1.default.parse(routePath);
        if (ext !== ".html" && ext !== "") {
            const filePath = path_1.default.join(sourceDir, routePath);
            skipExistingFile = fs_1.default.existsSync(filePath);
        }
        const logs = [];
        let crawled = false;
        if (!shuttingDown && !skipExistingFile) {
            try {
                // @ts-ignore
                await page._client.send("ServiceWorker.disable");
                await page.setCacheEnabled(options.puppeteer.cache);
                if (options.viewport)
                    await page.setViewport(options.viewport);
                if (options.skipThirdPartyRequests)
                    await (0, exports.skipThirdPartyRequests)({ page, options, basePath });
                (0, exports.enableLogging)({
                    page,
                    options,
                    basePath,
                    route,
                    onError: () => {
                        if (!options.ignorePageErrors) {
                            shuttingDown = true;
                        }
                    },
                    sourcemapStore
                }, logs);
                beforeFetch && beforeFetch({ page, route });
                await page.setUserAgent(options.userAgent);
                const tracker = (0, tracker_1.createTracker)(page);
                let responsePromise = Promise.resolve();
                try {
                    await page.goto(pageUrl, { waitUntil: "networkidle2" });
                    if (options.waitForResponse)
                        responsePromise = page.waitForResponse(options.waitForResponse, { timeout: 0 });
                }
                catch (e) {
                    e.message = (0, tracker_1.augmentTimeoutError)(e.message, tracker);
                    throw e;
                }
                finally {
                    tracker.dispose();
                }
                await responsePromise;
                if (options.waitFor)
                    await page.waitForTimeout(options.waitFor);
                if (options.crawl) {
                    const links = await (0, exports.getLinks)({ page });
                    await Promise.all(links.map(addToQueue));
                }
                afterFetch && (await afterFetch({ page, route, addToQueue, logs }));
                crawled = true;
            }
            catch (e) {
                if (!shuttingDown) {
                    console.log(`🔥 Crawl error at ${route}`, e);
                    if (!options.ignorePageErrors) {
                        shuttingDown = true;
                    }
                }
            }
            finally {
                await page.close();
                if (options.concurrencyType === puppeteer_cluster_1.Cluster.CONCURRENCY_BROWSER) {
                    const browser = page.browser();
                    if (options.cleanupBrowser) {
                        await options.cleanupBrowser(browser);
                    }
                    else {
                        await browser.close();
                    }
                }
            }
        }
        else {
            // this message creates a lot of noise if crawling enabled
            console.log(`🚧  skipping (${processed + 1}/${enqueued}) ${route}`);
        }
        processed++;
        allLogs.push({ url: pageUrl, logs });
        if (crawled) {
            const extensions = Array.isArray(options.saveAs) ? options.saveAs : [options.saveAs].filter(v => v);
            console.log(`✅  crawled ${processed} out of ${enqueued} (${route}) – saved ${extensions.map(e => `${options.fileName}.${e}`).join(", ")}`);
        }
        if (enqueued === processed) {
            streamClosed = true;
            console.log("Closing cluster and canceling waitForIdle as enqueued", enqueued, "= processed", processed);
            await cluster.close();
            waitForIdle.cancel();
            if (options.cleanup)
                options.cleanup();
        }
    };
    await cluster.task(async ({ page, data: pageUrl }) => await fetchPage(page, pageUrl));
    if (options.include) {
        await Promise.all(options.include.map(x => addToQueue(`${basePath}${x}`)));
    }
    waitForIdle = (0, exports.makeCancelable)(cluster.idle());
    try {
        await waitForIdle.promise;
        await cluster.close();
    }
    catch (e) {
        if (!e.isCanceled) {
            throw e;
        }
        console.log("Canceled waitForIdle successfully.");
        return allLogs;
    }
    finally {
        onEnd && onEnd();
    }
    if (shuttingDown) {
        throw "";
    }
    return allLogs;
};
exports.crawl = crawl;
