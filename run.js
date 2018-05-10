#!/usr/bin/env node

const url = require("url");
const { run } = require("./index.js");
const { reactSnap, homepage } = require(`${process.cwd()}/package.json`);

run({
  publicPath: homepage ? url.parse(homepage).pathname : "/",
  ...reactSnap
}).catch(() => {
  process.exit(1);
});
