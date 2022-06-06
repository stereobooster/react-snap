import puppeteer, {HTTPResponse, Page, PuppeteerLifeCycleEvent} from "puppeteer";
import nativeFs from "fs";
import {Options} from "html-minifier-terser";
// @ts-ignore
import type CleanCSS from "@types/clean-css";
import type { Cluster } from "puppeteer-cluster";

declare global {
  interface Window {
    snapSaveState?: () => Partial<Window>
  }
}


export interface IReactSnapOptions {
  port?: number | null,
  basePath?: string | null,
  source?: string,
  destination?: string,
  concurrency?: number,
  concurrencyType: typeof Cluster.CONCURRENCY_PAGE | typeof Cluster.CONCURRENCY_CONTEXT | typeof Cluster.CONCURRENCY_BROWSER,
  include?: string[],
  exclude?: RegExp[],
  userAgent?: string, // Default: "ReactSnap"
  // 4 params below will be refactored to one: `puppeteer: {}`
  // https://github.com/stereobooster/react-snap/issues/120
  headless?: boolean,
  puppeteer?: {
    cache?: boolean,
    timeout?: number,
  },
  puppeteerArgs?: string[],
  puppeteerExecutablePath?: string,
  puppeteerIgnoreHTTPSErrors?: boolean,
  publicPath?: string,
  minifyHtml?: false | Options,
  processHtml?(html: string, route: string, options: IReactSnapOptions): Promise<string>
  processPage?(page: Page, route: string, options: IReactSnapOptions, process: "html" | "css"): Promise<{ content: string, title: string }>
  // mobile first approach
  viewport?: {
    width: number,
    height: number,
  },
  sourceMaps?: boolean,
  // using CRA1 for compatibility with previous version will be changed to false in v2
  fixWebpackChunksIssue?: boolean | "Parcel" | "CRA2" | "CRA1",
  removeBlobs?: boolean,
  fixInsertRule?: boolean,
  skipThirdPartyRequests?: boolean,
  ignorePageErrors?: boolean,
  cacheAjaxRequests?: boolean,
  http2PushManifest?: boolean,
  // may use some glob solution in the future, if required
  // works when http2PushManifest: true
  ignoreForPreload?: string[], // Default: ["service-worker.js"]
  preconnectThirdParty?: boolean,
  // Experimental. This config stands for two strategies inline and critical. Inline strategy can contain errors, like, confuse relative urls.
  minifyCss?: CleanCSS.OptionsOutput | CleanCSS.OptionsPromise | false,
  inlineCss?: boolean,
  warnOnInlineCssKb?: number,
  leaveLinkCss?: boolean
  processCss?(page: Page, css: string, html: string, route: string, options: IReactSnapOptions): Promise<string>
  // feature creeps to generate screenshots
  saveAs?: "html" | "png" | "jpeg" | ("html" | "png" | "jpeg")[],
  fileName: string,
  crawl?: boolean,
  waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[],
  waitFor?: number | false,
  waitForResponse?(res: HTTPResponse): boolean
  externalServer?: boolean,
  removeStyleTags?: boolean,
  preloadImages?: boolean,
  cleanPreloads?: boolean,
  // add async true to script tags
  asyncScriptTags?: boolean,
  removeScriptTags?: boolean,
  ignoreHTTPSErrors?: boolean,
  cleanup?(): void
  cleanupBrowser?(browser: puppeteer.Browser): Promise<void>

  /**
   * @deprecated preloadResources option deprecated. Use preloadImages or cacheAjaxRequests
   */
  preloadResources?: any

  /**
   * @deprecated minifyOptions option renamed to minifyHtml
   */
  minifyOptions?: any

  /**
   * @deprecated asyncJs option renamed to asyncScriptTags
   */
  asyncJs?: any
}

export interface IReactSnapRunLogs {
  url: string,
  logs: any[][]
}

export type ReactSnapRunInfo = [string[], IReactSnapRunLogs[]]

export interface ISaveAsParams {
  page: puppeteer.Page,
  filePath: string
  options: IReactSnapOptions
  route: string
  fs: typeof nativeFs
}

export interface IEnableLoggingOptions {
  page: puppeteer.Page,
  options: IReactSnapOptions
  route: string
  basePath: string
  sourcemapStore: any
  onError(): void
}

export interface ICrawlParams {
  options: IReactSnapOptions
  basePath: string
  publicPath?: string,
  sourceDir: string,
  beforeFetch(params: {page: puppeteer.Page, route: string}): any
  afterFetch(params: {page: puppeteer.Page, route: string, addToQueue: (newUrl: string) => Promise<void>, logs: string[]}): any
  onEnd(): void
}

export interface IInlineCssParams {
  page: puppeteer.Page,
  pageUrl: string
  options: IReactSnapOptions
  basePath: string
  route: string
}