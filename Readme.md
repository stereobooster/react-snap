# react-snap ![npm](https://img.shields.io/npm/v/react-snap.svg) ![npm](https://img.shields.io/npm/dt/react-snap.svg)

Pre-renders web app into static HTML. Uses headless chrome to prerender. Crawls all available links starting from root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch to be lightweight. Thanksfully to [puppeteer](https://github.com/GoogleChrome/puppeteer) and [highland](https://github.com/caolan/highland) code is very short and easy to understand. It is about 100 LOC - take a [look](https://github.com/stereobooster/react-snap/blob/master/index.js)

## TODO

- Use [penthouse](https://github.com/pocketjoso/penthouse) to extract critical CSS
- Gracefull shutdown doesn't work

## Features

- Enables SEO for SPA (google, duckduckgo...)
- Enables SMO for SPA (twitter, facebook...)
- Works out-of-the-box - no code-changes needed

## Install

```sh
yarn add react-snap
```

## Usage

Example project [badsyntax/react-snap-example](https://github.com/badsyntax/react-snap-example).

`scripts/sw-precache-config.js`:

```js
module.exports = {
  staticFileGlobs: [
    "build/static/css/*.css",
    "build/static/js/*.js",
    "build/200.html",
    "build/index.html"
  ],
  stripPrefix: "build",
  publicPath: ".",
  runtimeCaching: [{
    urlPattern: /images/,
    handler: "fastest"
  }],
  navigateFallback: '/200.html' // use shell here if you have one
};
```

`package.json`:

```json
"scripts": {
    "generate-sw": "sw-precache --root=build --config scripts/sw-precache-config.js && uglifyjs build/service-worker.js -o build/service-worker.js",
    "build-snap": "react-scripts build && react-snap && yarn run generate-sw"
}
```

`src/index.js`

```js
import { hydrate, render } from 'react-dom';

const rootElement = document.getElementById('root');
if (rootElement.hasChildNodes()) {
  hydrate(<App />, rootElement);
} else {
  render(<App />, rootElement);
}
```

### Google Analytics

```js
import ReactGA from 'react-ga'
const snap = navigator.userAgent !== 'ReactSnap';
const production = process.env.NODE_ENV === 'production';
if (production && snap) { ReactGA.initialize('XX-XXXXXXXX-X') }
```

## Hosting on AWS S3 + cloudflare.com

If you have less than 20k requests in a month you can host for free. Plus you can get free SSL from Cloudflare.

There is [blogpost](https://medium.com/@omgwtfmarc/deploying-create-react-app-to-s3-or-cloudfront-48dae4ce0af) recommended by CRA. **Do not follow it**.

Basic AWS S3 setup is described [here](http://docs.aws.amazon.com/AmazonS3/latest/user-guide/static-website-hosting.html)

### Setup Cloudflare

- Set `Browser Cache Expiration` to `Respect Existing Headers`
- Set `Always use HTTPS` to `On`
- `Auto Minify` uncheck all checkboxes

Some additional bits about Cloudflare: https://github.com/virtualjj/aws-s3-backed-cloudflare-static-website

### Deployment

Use [s3-sync-aws](https://www.npmjs.com/package/s3-sync-aws) for deployment:

```js
import _ from "highland"
import level from "level"
import s3sync from "s3-sync-aws"
import readdirp from "readdirp"
import fs from "fs"

const db = level(__dirname + "/cache")

const files = readdirp({
    root: __dirname + "/../build"
  , directoryFilter: ["!.git", "!cache", "!.DS_Store"]
})

const uploader = s3sync({
    key: process.env.AWS_ACCESS_KEY
  , secret: process.env.AWS_SECRET_KEY
  , bucket: ""
  , concurrency: 16
  , headers: {
      CacheControl: "max-age=14400" // use longer cache if you can
  }
}).on("data", file => console.log(`max-age=14400 ${file.url}`)

const shortTermUploader = s3sync(db, {
    key: process.env.AWS_ACCESS_KEY
  , secret: process.env.AWS_SECRET_KEY
  , bucket: ""
  , concurrency: 16
  , headers: {
      CacheControl: "max-age=0"
  }
}).on("data", file => console.log(`max-age=0 ${file.url}`)

_(files)
  .reject((x) => x.path.indexOf("manifest.json") !== -1 )
  .reject((x) => x.path.indexOf(".html") !== -1 )
  .reject((x) => x.path.indexOf("service-worker.js") !== -1 )
  .pipe(uploader)

_(files)
  .filter((x) => (x.path.indexOf(".html") !== -1 || x.path.indexOf("service-worker.js") !== -1 || x.path.indexOf("manifest.json") !== -1) )
  .pipe(shortTermUploader)
```

### Caveats

- AWS S3 does not support custom HTTP headers, that is why you will not be able to use [HTTP2 push with Cloudflare](https://blog.cloudflare.com/announcing-support-for-http-2-server-push-2/)

