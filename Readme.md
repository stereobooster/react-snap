# react-snap [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg)

Pre-renders web app into static HTML. Uses headless chrome to prerender. Crawls all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get best loading speed.

## Features

- Enables SEO for SPA (google, duckduckgo...)
- Enables SMO for SPA (twitter, facebook...)
- Works out-of-the-box wit c-r-a - no code-changes required. Also, can work with another setup.
- Thanks to prerendered HTML and inlined critical CSS you will get very fast first paint.
- Thanks to preloading you will get very fast interaction time

## Basic usage with create-react-app

Example project [badsyntax/react-snap-example](https://github.com/badsyntax/react-snap-example).

Install:

```sh
yarn add --dev react-snap
```

Change `package.json`:

```json
"scripts": {
    "build": "react-scripts build && react-snap"
}
```

Change `src/index.js` (for React 16+):

```js
import { hydrate, render } from 'react-dom';

const rootElement = document.getElementById('root');
if (rootElement.hasChildNodes()) {
  hydrate(<App />, rootElement);
} else {
  render(<App />, rootElement);
}
```

That's it!

### Preload resources

ReactSnap can capture all required resources on the page and modify HTML, to instruct browser to preload those resources. 
- It will use `<link rel="preload" as="image">` for images.
- it will store `json` request to the same domain in `window.snapStore[<path>]`, where `<path>` is the path of json request

Use `preloadResources: true` to enable this feature.

### Inline css

ReactSnap can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

Caveat: as of now `<noscript>` fallback not implemented. As soon it will be implemented, this feature will be enabled by default.

### Usage with service workers

`package.json`:

```json
"scripts": {
    "generate-sw": "sw-precache --root=build --config scripts/sw-precache-config.js && uglifyjs build/service-worker.js -o build/service-worker.js",
    "build-snap": "react-scripts build && react-snap && yarn run generate-sw"
}
```

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

### Usage with Google Analytics

```js
import ReactGA from 'react-ga'
const snap = navigator.userAgent !== 'ReactSnap';
const production = process.env.NODE_ENV === 'production';
if (production && snap) { ReactGA.initialize('XX-XXXXXXXX-X') }
```

### Use to render screenshots

`screenshots.js`

```js
const { crawl } = require("react-snap");

crawl({
  destination: "build/screenshots",
  saveAs: "png"
});
```

## Hosting on AWS S3 + cloudflare.com

If you have less than 20k requests in a month you can host for free. Plus you can get free SSL from CloudFlare.

There is [blogpost](https://medium.com/@omgwtfmarc/deploying-create-react-app-to-s3-or-cloudfront-48dae4ce0af) recommended by c-r-a. **Do not follow it**.

Basic AWS S3 setup described [here](http://docs.aws.amazon.com/AmazonS3/latest/user-guide/static-website-hosting.html).

### Setup Cloudflare

- Set `Browser Cache Expiration` to `Respect Existing Headers`
- Set `Always use HTTPS` to `On`
- `Auto Minify` uncheck all checkboxes

Some additional bits about CloudFlare: https://github.com/virtualjj/aws-s3-backed-cloudflare-static-website

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

- AWS S3 does not support custom HTTP headers, that is why you will not be able to use [HTTP2 push with Cloudflare](https://blog.cloudflare.com/announcing-support-for-http-2-server-push-2/).
- [s3-sync-aws does not remove old files](https://github.com/andreialecu/s3-sync-aws/issues/3).

## TODO

- Use [npm package for loadCss](https://www.npmjs.com/package/fg-loadcss) instead of vendoring it.
- Improve `preconnect`, `dns-prefetch` functionality
- Implement `noscript` fallback for loadCss trick
- Tests
- Documentation
- Evaluate [penthouse](https://github.com/pocketjoso/penthouse) as alternative to [minimalcss](https://github.com/peterbe/minimalcss)
- Gracefull shutdown doesn't work
- Check deployments to [now](https://zeit.co/now#features)
- Check deployments to [surge](https://surge.sh/help/getting-started-with-surge)
- Docuemnt example with [appcache-nanny](https://github.com/gr2m/appcache-nanny), while webkit doesn't support [seviceWorkers](https://webkit.org/status/#specification-service-workers). Keep an eye on [isserviceworkerready](https://jakearchibald.github.io/isserviceworkerready/)

## Ideas

- Generate [AWS S3 redirects](http://sukharevd.net/static/files/blog/s3routes/index.html) from React Router Redirects.