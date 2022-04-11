import { ICrawlParams, IEnableLoggingOptions, IReactSnapRunLogs } from "./model";
/**
 * @param {{page: Page, options: {skipThirdPartyRequests: true}, basePath: string }} opt
 * @return {Promise<void>}
 */
export declare const skipThirdPartyRequests: (opt: any) => Promise<void>;
/**
 * @param {{page: Page, options: {sourceMaps: boolean}, route: string, onError: ?function }} opt
 * @return {void}
 */
export declare const enableLogging: (opt: IEnableLoggingOptions, logs?: any[]) => void;
/**
 * @param {{page: Page}} opt
 * @return {Promise<Array<string>>}
 */
export declare const getLinks: (opt: any) => Promise<any>;
interface ICancelablePromise<R extends any = any> {
    promise: Promise<R>;
    cancel(): void;
}
export declare const makeCancelable: <R extends unknown = any>(promise: Promise<R>) => ICancelablePromise<R>;
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
export declare const crawl: (opt: ICrawlParams) => Promise<IReactSnapRunLogs[]>;
export {};
