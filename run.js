#!/usr/bin/env node

const url = require("url");
const { run } = require("./index.js");
let { reactSnap, homepage } = require(`${process.cwd()}/package.json`);

// because https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#serving-the-same-build-from-different-paths
if (homepage === "." || homepage === "/.") homepage = "/";

// because https://github.com/facebook/create-react-app/blob/master/packages/react-scripts/template/README.md#building-for-relative-paths
if (homepage && !/\/|https?:\/\//.test(homepage)) {
  console.log(`reactSnap expects valid url in homepage field in package.json.`);
  console.log(`Instead found ${homepage}.`);
  console.log(`Please provide valid url or skip this field`);
  console.log(
    `Examples of valid urls: /path or http://example.com or https://example.com`
  );
  process.exit(1);
}

run({
  publicPath: homepage ? url.parse(homepage).pathname : "/",
  ...reactSnap
}).catch(() => {
  process.exit(1);
});
