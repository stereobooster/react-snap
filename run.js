#!/usr/bin/env node

const url = require('url')
const {run} = require('./index.js')
const {join} = require('path')

const rootDirectory = process.cwd()
const {reactSnap, homepage} = require(join(rootDirectory, 'package.json'))

const publicUrl = process.env.PUBLIC_URL || homepage

const load = pathOrModule => {
  try {
    return require(pathOrModule)
  } catch (e) {
    return null
  }
}

let config = reactSnap

if (!reactSnap) {
  const results = process.argv.filter(s => s.split('=')[0] === '--config')
  const [match] = results
  const [, configPath] = match.split('=')

  if (configPath) {
    config = load(configPath) || load(join(rootDirectory, configPath))
  } else {
    !configFile &&
      console.log(
        'Must specify configuration field in package.json, or config file path with --config flag in your postbuild script',
      )
    process.exit(1)
  }
}

console.log(config)

run({
  publicPath: publicUrl ? url.parse(publicUrl).pathname : '/',
  ...reactSnap,
}).catch(error => {
  console.error(error)
  process.exit(1)
})
