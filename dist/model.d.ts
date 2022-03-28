/// <reference types="clean-css" />
/// <reference types="node" />
import puppeteer, { HTTPResponse, Page, PuppeteerLifeCycleEvent } from "puppeteer";
import nativeFs from "fs";
import { Options } from "html-minifier-terser";
import type CleanCSS from "@types/clean-css";
declare global {
    interface Window {
        snapSaveState?: () => Partial<Window>;
    }
}
export interface IReactSnapOptions {
    port?: number | null;
    basePath?: string | null;
    source?: string;
    destination?: string;
    concurrency?: number;
    include?: string[];
    exclude?: RegExp[];
    userAgent?: string;
    headless?: boolean;
    puppeteer?: {
        cache?: boolean;
        timeout?: number;
    };
    puppeteerArgs?: string[];
    puppeteerExecutablePath?: string;
    puppeteerIgnoreHTTPSErrors?: boolean;
    publicPath?: string;
    minifyHtml?: false | Options;
    processHtml?(html: string, route: string, options: IReactSnapOptions): Promise<string>;
    processPage?(page: Page, route: string, options: IReactSnapOptions, process: "html" | "css"): Promise<{
        content: string;
        title: string;
    }>;
    viewport?: {
        width: number;
        height: number;
    };
    sourceMaps?: boolean;
    fixWebpackChunksIssue?: boolean | "Parcel" | "CRA2" | "CRA1";
    removeBlobs?: boolean;
    fixInsertRule?: boolean;
    skipThirdPartyRequests?: boolean;
    ignorePageErrors?: boolean;
    cacheAjaxRequests?: boolean;
    http2PushManifest?: boolean;
    ignoreForPreload?: string[];
    preconnectThirdParty?: boolean;
    minifyCss?: CleanCSS.OptionsOutput | CleanCSS.OptionsPromise | false;
    inlineCss?: boolean;
    leaveLinkCss?: boolean;
    processCss?(page: Page, css: string, html: string, route: string, options: IReactSnapOptions): Promise<string>;
    saveAs?: "html" | "png" | "jpeg" | ("html" | "png" | "jpeg")[];
    fileName: string;
    crawl?: boolean;
    waitUntil?: PuppeteerLifeCycleEvent | PuppeteerLifeCycleEvent[];
    waitFor?: number | false;
    waitForResponse?(res: HTTPResponse): boolean;
    externalServer?: boolean;
    removeStyleTags?: boolean;
    preloadImages?: boolean;
    cleanPreloads?: boolean;
    asyncScriptTags?: boolean;
    removeScriptTags?: boolean;
    ignoreHTTPSErrors?: boolean;
    /**
     * @deprecated preloadResources option deprecated. Use preloadImages or cacheAjaxRequests
     */
    preloadResources?: any;
    /**
     * @deprecated minifyOptions option renamed to minifyHtml
     */
    minifyOptions?: any;
    /**
     * @deprecated asyncJs option renamed to asyncScriptTags
     */
    asyncJs?: any;
}
export interface IReactSnapRunLogs {
    url: string;
    logs: any[][];
}
export declare type ReactSnapRunInfo = [string[], IReactSnapRunLogs[]];
export interface ISaveAsParams {
    page: puppeteer.Page;
    filePath: string;
    options: IReactSnapOptions;
    route: string;
    fs: typeof nativeFs;
}
export interface IEnableLoggingOptions {
    page: puppeteer.Page;
    options: IReactSnapOptions;
    route: string;
    basePath: string;
    sourcemapStore: any;
    onError(): void;
}
export interface ICrawlParams {
    options: IReactSnapOptions;
    basePath: string;
    publicPath?: string;
    sourceDir: string;
    beforeFetch(params: {
        page: puppeteer.Page;
        route: string;
    }): any;
    afterFetch(params: {
        page: puppeteer.Page;
        browser: puppeteer.Browser;
        route: string;
        addToQueue: (newUrl: string) => void;
        logs: string[];
    }): any;
    onEnd(): void;
}
export interface IInlineCssParams {
    page: puppeteer.Page;
    pageUrl: string;
    options: IReactSnapOptions;
    basePath: string;
    browser: puppeteer.Browser;
    route: string;
}
