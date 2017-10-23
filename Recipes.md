# create-react-app recipes

[![Hacker News](https://img.shields.io/badge/Hacker%20News-Y-orange.svg)](https://news.ycombinator.com/item?id=15521574)

<!-- toc -->

- [General](#general)
  * [Prerender website without ejecting](#prerender-website-without-ejecting)
  * [Preact without ejecting](#preact-without-ejecting)
  * [Split in chunks](#split-in-chunks)
  * [Configure sw-precache without ejecting](#configure-sw-precache-without-ejecting)
  * [Add Appcache](#add-appcache)
  * [Meta tags](#meta-tags)
- [Hosting on AWS S3 + cloudflare.com](#hosting-on-aws-s3--cloudflarecom)
  * [Setup Cloudflare](#setup-cloudflare)
  * [Deployment](#deployment)
  * [Caveats](#caveats)
- [react-snap specific](#react-snap-specific)
  * [Usage with Google Analytics](#usage-with-google-analytics)
  * [Use to render screenshots](#use-to-render-screenshots)

<!-- tocstop -->

## General

### Prerender website without ejecting

Use [react-snap](https://github.com/stereobooster/react-snap/blob/master/Readme.md#basic-usage-with-create-react-app) ;)

### Preact without ejecting

```sh
yarn add preact preact-compat
````

`scripts/build-preact.js`:

```js
process.env.NODE_ENV = "production"

const config = require("react-scripts/config/webpack.config.prod")

config.resolve.alias["react"] = "preact-compat"
config.resolve.alias["react-dom"] = "preact-compat"

require("react-scripts/scripts/build")
```

### Split in chunks

With webpack 2+ you can use dynamic `import` to split bundles in chunks. See articles:
- http://thejameskyle.com/react-loadable.html
- https://serverless-stack.com/chapters/code-splitting-in-create-react-app.html

### Configure sw-precache without ejecting

Tip: See [material design offline states](https://material.io/guidelines/patterns/offline-states.html) for UI advices on offline applications. Also see section about [snackbars & toasts](https://material.io/guidelines/components/snackbars-toasts.html).

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
    "build/shell.html",
    "build/index.html"
  ],
  stripPrefix: "build",
  publicPath: ".",
  runtimeCaching: [{
    urlPattern: /images/,
    handler: "fastest"
  }],
  navigateFallback: '/shell.html'
};
```

You can use `200.html` instead of `shell.html` if you use `react-snap` and do not have separate `shell.html`. This is important because `react-snap` will prerender `index.html` and when user will be offline their will see a flash of your homepage on navigation.

### Add Appcache

[Webkit promises to add Service Worker support](https://webkit.org/status/#specification-service-workers) meantime we can use Appcache.

Tip: you can prompt user to "install your site as web app", like [this](https://www.npmjs.com/package/angular-add-to-home-screen).

```sh
yarn add appcache-nanny
```

copy [`appcache-loader.html`](https://github.com/gr2m/appcache-nanny/blob/master/appcache-loader.html) to `public/`.

`scripts/generate-appcache.js`:

```js
const SW_PRECACHE_CONFIG = './sw-precache-config'
const OUT_FILE = '../build/manifest.appcache'

const glob = require('globby')
const { staticFileGlobs, stripPrefix, navigateFallback } = require(SW_PRECACHE_CONFIG)
const fs = require('fs')
const path = require('path')

glob(staticFileGlobs).then(files => {
  // filter out directories
  files = files.filter(file => fs.statSync(file).isFile())
  // strip out prefix
  files = files.map(file => file.replace(stripPrefix, ''))

  const index = files.indexOf(navigateFallback);
  if (index > -1) {
    files.splice(index, 1);
  }

  const out = [
    'CACHE MANIFEST',
    `# version ${ new Date().getTime() }`,
    '',
    'CACHE:',
    ...files,
    '',
    'NETWORK:',
    '*',
    'http://*',
    'https://*',
    '',
    'FALLBACK:',
    `/ ${navigateFallback}`
  ].join('\n')

  fs.writeFileSync(path.join(__dirname, OUT_FILE), out)
  console.log(`Wrote ${OUT_FILE} with ${files.length} resources.`)
})
```

`registerServiceWorker.js`:

```js
import appCacheNanny from "appcache-nanny";

export default function register() {
  if (process.env.NODE_ENV !== 'production') return false;
  if ('serviceWorker' in navigator) {
    window.addEventListener('load', () => {
      const swUrl = `${process.env.PUBLIC_URL}/service-worker.js`;
      navigator.serviceWorker
        .register(swUrl)
        .then(registration => {
          registration.onupdatefound = () => {
            const installingWorker = registration.installing;
            installingWorker.onstatechange = () => {
              if (installingWorker.state === 'installed') {
                if (navigator.serviceWorker.controller) {
                  // At this point, the old content will have been purged and
                  // the fresh content will have been added to the cache.
                  // It's the perfect time to display a "New content is
                  // available; please refresh." message in your web app.
                  console.log('New content is available; please refresh.');
                } else {
                  // At this point, everything has been precached.
                  // It's the perfect time to display a
                  // "Content is cached for offline use." message.
                  console.log('Content is cached for offline use.');
                }
              }
            };
          };
        })
        .catch(error => {
          console.error('Error during service worker registration:', error);
        });
    });
  } else if (window.applicationCache) {
    appCacheNanny.start();
    appCacheNanny.on('updateready', () => {
      console.log('New content is available; please refresh.');
    });
    appCacheNanny.on('cached', () => {
       console.log('Content is cached for offline use.');
    });
  }
  return true;
}

export function unregister() {
  if ('serviceWorker' in navigator) {
    navigator.serviceWorker.ready.then(registration => {
      registration.unregister();
    });
  } else if (window.applicationCache) {
    appCacheNanny.stop();
  }
}
```

### Meta tags

Tip: If you do not have images for social media, you can use screenshots of your website. See [Use to render screenshots](#use-to-render-screenshots) section.

```sh
yarn add react-helmet
```

```js
import React from 'react'
import Helmet from 'react-helmet'
import { basePath } from './Config.js';

const locales = {
  "en": "en_US"
}

const Meta = (data) => {
  const lang = data.lang || "en"
  const title = data.title
  const description = data.description
  const image = data.image !== undefined && `${basePath}${data.image}`
  const canonical = data.canonical !== undefined && `${basePath}${data.canonical}`
  const type = data.type === undefined ? "article" : "website"
  const width = data.image && (data.width || 1200)
  const height = data.image && (data.height || 630)

  return (
    <Helmet>
      <html lang={ lang } />
      <title>{ title }</title>
      <meta name="description" content={ description } />
      { canonical ? <link rel="canonical" href={ canonical } /> : null }
      { image ? <link rel="image_src" href={ image } /> : null }
      { image ? <meta itemprop="image" content={ image } /> : null }

      <meta property="og:site_name" content="..." />
      <meta property="og:title" content={ title } />
      { description ? <meta property="og:description" content={ description } /> : null }
      { canonical ? <meta property="og:url" content={ canonical } /> : null }
      <meta property="og:locale" content={ locales[lang] } />
      <meta property="og:type" content={ type } />
      { image ? <meta property="og:image" content={ image } /> : null }
      { width ? <meta property="og:image:width" content={ width } /> : null }
      { height ? <meta property="og:image:height" content={ height } /> : null }
      <meta property="fb:pages" content="..." />

      {/* change type of twitter if there is no image? */}
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:title" content={ title } />
      { description ? <meta name="twitter:description" content={ description } /> : null }
      { image ? <meta name="twitter:image" content={ image } /> : null }
      <meta name="twitter:site" content="@..." />
      { canonical ? <link rel="alternate" href={ `${basePath}${data.canonical}` } hreflang={ lang } /> : null }
      { canonical ? <link rel="alternate" href={ `${basePath}${alternatePathname}` } hreflang={ alternateLang } /> : null }
    </Helmet>
  )
}

export default Meta
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

const noCacheUploader = s3sync(db, {
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
  .reject((x) => x.path.indexOf("manifest.appcache") !== -1 )
  .pipe(uploader)

_(files)
  .filter((x) => (x.path.indexOf(".html") !== -1 || x.path.indexOf("service-worker.js") !== -1 || x.path.indexOf("manifest.json") !== -1 || x.path.indexOf("manifest.appcache") !== -1) )
  .pipe(noCacheUploader)
```

### Caveats

- AWS S3 does not support custom HTTP headers, that is why you will not be able to use [HTTP2 push with Cloudflare](https://blog.cloudflare.com/announcing-support-for-http-2-server-push-2/).
- [s3-sync-aws does not remove old files](https://github.com/andreialecu/s3-sync-aws/issues/3).

## react-snap specific

### Usage with Google Analytics

```js
import ReactGA from 'react-ga'
const snap = navigator.userAgent !== 'ReactSnap';
const production = process.env.NODE_ENV === 'production';
if (production && snap) { ReactGA.initialize('XX-XXXXXXXX-X') }
```

### Use to render screenshots

`scripts/screenshots.js`:

```js
const { run } = require("react-snap");

run({
  destination: "build/screenshots",
  saveAs: "png"
});
```
