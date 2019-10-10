#!/usr/bin/env node

const { run } = require("./index.js");
const {
  reactSnap,
  homepage,
  devDependencies,
  dependencies
} = require(`${process.cwd()}/package.json`);

const publicUrl = process.env.PUBLIC_URL || homepage;

const reactScriptsVersion = parseInt(
  (devDependencies && devDependencies["react-scripts"])
  || (dependencies && dependencies["react-scripts"])
);
let fixWebpackChunksIssue;
switch (reactScriptsVersion) {
  case 1:
    fixWebpackChunksIssue = "CRA1";
    break;
  case 2:
    fixWebpackChunksIssue = "CRA2";
    break;
}

const parcel = Boolean(
  (devDependencies && devDependencies["parcel-bundler"])
  || (dependencies && dependencies["parcel-bundler"])
);

if (parcel) {
  if (fixWebpackChunksIssue) {
    console.log("Detected both Parcel and CRA. Fixing chunk names for CRA!")
  } else {
    fixWebpackChunksIssue = "Parcel";
  }
}

run({
  publicPath: publicUrl,
  fixWebpackChunksIssue,
  ...reactSnap
}).catch(error => {
  console.error(error);
  process.exit(1);
});