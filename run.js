#!/usr/bin/env node

const { run } = require("./index.js");
const { reactSnap } = require(`${process.cwd()}/package.json`);

run(reactSnap);
