#!/usr/bin/env node

const url = require("url");
const { run } = require("./index.js");
const { reactSnap, homepage } = require(`${process.cwd()}/package.json`);

const publicUrl = process.env.PUBLIC_URL || homepage;

run({
  publicPath: publicUrl ? url.parse(publicUrl).pathname : "/",
  ...reactSnap
}).catch((error) => {
  console.error(error)
  process.exit(1);
});
