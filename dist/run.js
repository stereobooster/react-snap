#!/usr/bin/env node
"use strict";
var __importDefault = (this && this.__importDefault) || function (mod) {
    return (mod && mod.__esModule) ? mod : { "default": mod };
};
Object.defineProperty(exports, "__esModule", { value: true });
const url_1 = __importDefault(require("url"));
const index_1 = require("./index");
const { reactSnap, homepage, devDependencies, dependencies } = require(`${process.cwd()}/package.json`);
const publicUrl = process.env.PUBLIC_URL || homepage;
const reactScriptsVersion = parseInt((devDependencies && devDependencies["react-scripts"])
    || (dependencies && dependencies["react-scripts"]));
let fixWebpackChunksIssue;
switch (reactScriptsVersion) {
    case 1:
        fixWebpackChunksIssue = "CRA1";
        break;
    case 2:
        fixWebpackChunksIssue = "CRA2";
        break;
}
const parcel = Boolean((devDependencies && devDependencies["parcel-bundler"])
    || (dependencies && dependencies["parcel-bundler"]));
if (parcel) {
    if (fixWebpackChunksIssue) {
        console.log("Detected both Parcel and CRA. Fixing chunk names for CRA!");
    }
    else {
        fixWebpackChunksIssue = "Parcel";
    }
}
(0, index_1.run)(Object.assign({ publicPath: publicUrl ? url_1.default.parse(publicUrl).pathname : "/", fixWebpackChunksIssue }, reactSnap)).catch(error => {
    console.error(error);
    process.exit(1);
});
