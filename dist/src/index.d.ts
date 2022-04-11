import nativeFs from "fs";
import { IReactSnapOptions, ReactSnapRunInfo } from "./model";
export declare const run: (userOptions: IReactSnapOptions, { fs }?: {
    fs: typeof nativeFs;
}) => Promise<ReactSnapRunInfo>;
export { IReactSnapOptions, ReactSnapRunInfo };
