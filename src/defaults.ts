import { Cluster } from "puppeteer-cluster";
import {IReactSnapOptions} from "./model";

export const defaultOptions: IReactSnapOptions = {
  //# stable configurations
  port: 45678,
  basePath: "http://localhost",
  source: "build",
  destination: null,
  concurrency: 4,
  concurrencyType: Cluster.CONCURRENCY_BROWSER,
  include: ["/"],
  exclude: [],
  userAgent: "ReactSnap",
  // 4 params below will be refactored to one: `puppeteer: {}`
  // https://github.com/stereobooster/react-snap/issues/120
  headless: true,
  puppeteer: {
    cache: true
  },
  puppeteerArgs: [],
  puppeteerExecutablePath: undefined,
  puppeteerIgnoreHTTPSErrors: false,
  publicPath: "/",
  minifyCss: {},
  minifyHtml: {
    collapseBooleanAttributes: true,
    collapseWhitespace: true,
    decodeEntities: true,
    keepClosingSlash: true,
    sortAttributes: true,
    sortClassName: false
  },
  processHtml: undefined,
  processPage: undefined,
  // mobile first approach
  viewport: {
    width: 480,
    height: 850
  },
  sourceMaps: true,
  //# workarounds
  // using CRA1 for compatibility with previous version will be changed to false in v2
  fixWebpackChunksIssue: "CRA1",
  removeBlobs: true,
  fixInsertRule: true,
  ignorePageErrors: false,
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
  warnOnInlineCssKb: 20,
  processCss: undefined,
  leaveLinkCss: undefined,
  //# feature creeps to generate screenshots
  saveAs: "html", // options are "html", "png", "jpeg" as string or array
  fileName: "index",
  crawl: true,
  waitFor: false,
  externalServer: false,
  //# even more workarounds
  removeStyleTags: false,
  preloadImages: false,
  cleanPreloads: false,
  // add async true to script tags
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
export const defaults = (userOptions: IReactSnapOptions) => {
  const options: IReactSnapOptions = {
    ...defaultOptions,
    ...userOptions
  };
  options.destination = options.destination || options.source;
  options.basePath = options.basePath || defaultOptions.basePath;

  let exit = false;
  if (!options.include || !options.include.length) {
    console.log("🔥  include option should be an non-empty array");
    exit = true;
  }
  if (options.preloadResources) {
    console.log(
      "🔥  preloadResources option deprecated. Use preloadImages or cacheAjaxRequests"
    );
    exit = true;
  }
  if (options.minifyOptions) {
    console.log("🔥  minifyOptions option renamed to minifyHtml");
    options.minifyHtml = options.minifyOptions;
  }
  if (options.asyncJs) {
    console.log("🔥  asyncJs option renamed to asyncScriptTags");
    options.asyncScriptTags = options.asyncJs;
  }
  if (/\.(html|jpg|jpeg|png)$/.test(options.fileName)) {
    console.log("🔥  fileName should be base, appropritate extension will be added");
    options.fileName = options.fileName.replace(/\.(html|jpg|jpeg|png)$/, "");
  }
  if (options.fixWebpackChunksIssue === true) {
    console.log(
      "🔥  fixWebpackChunksIssue - behaviour changed, valid options are CRA1, CRA2, Parcel, false"
    );
    options.fixWebpackChunksIssue = "CRA1";
  }
  const features = ["html", "png", "jpg", "jpeg"];
  if (
    Array.isArray(options.saveAs) ?
      !options.saveAs.every(saveAs => features.includes(saveAs))
      :
      !features.includes(options.saveAs)
  ) {
    console.log("🔥  saveAs supported values are html, png, and jpeg");
    exit = true;
  }
  if (exit) throw new Error();
  if (options.minifyHtml && !options.minifyHtml.minifyCSS) {
    options.minifyHtml.minifyCSS = options.minifyCss || {};
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