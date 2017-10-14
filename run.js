#!/usr/bin/env node

const { crawl } = require("./index.js");
const { reactSnap } = require(`${process.cwd()}/package.json`);

crawl(reactSnap);
