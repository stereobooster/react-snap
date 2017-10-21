#!/usr/bin/env node

const { run } = require("./index.js");
const { userOptions } = require(`${process.cwd()}/package.json`);

run(userOptions);
