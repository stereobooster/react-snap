import { IReactSnapOptions } from "./model";
export declare const defaultOptions: IReactSnapOptions;
/**
 *
 * @param {{source: ?string, destination: ?string, include: ?Array<string>, sourceMaps: ?boolean, skipThirdPartyRequests: ?boolean }} userOptions
 * @return {*}
 */
export declare const defaults: (userOptions: IReactSnapOptions) => IReactSnapOptions;
