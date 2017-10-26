# react-snap [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg) [![Hacker News](https://img.shields.io/badge/Hacker%20News-Y-orange.svg)](https://news.ycombinator.com/item?id=15553863)

Pre-renders web app into static HTML. Uses headless chrome to pre-render. Crawls all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get best loading performance.

## Features

- Does not depend on React. The name is inspired by `react-snapshot` and because the initial goal was to enable seamless integration with `create-react-app`. Actually, it works with any technology. Thinking about changing the name.
- Enables SEO (google, duckduckgo...) and SMO (twitter, facebook...) for SPA.
- Works out-of-the-box with [create-react-app](https://github.com/facebookincubator/create-react-app) - no code-changes required.
- Uses real browser behind the scene, so no issue with unsupported HTML5 features, like WebGL or Blobs.
- Crawls all pages starting from the root, no need to list pages by hand, like in `prep`.
- With prerendered HTML and inlined critical CSS you will get fast first paint, like with [critical](https://github.com/addyosmani/critical).
- With `Preload resources` feature you will get faster first interaction time if your page does do AJAX requests.
- [Works with webpack 2 code splitting feature](https://github.com/stereobooster/react-snap/issues/5)
- [Handles sourcemaps](https://github.com/stereobooster/react-snap/issues/4)

Please note: some features are experimental, but basic prerendering is considered stable enough. API is subject to change before freeze in version `1.0`.

## Basic usage with create-react-app

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

### Inline css

Experimental feature. Requires improvements.

`react-snap` can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

Caveat: as of now `<noscript>` fallback not implemented. As soon it will be implemented, this feature will be enabled by default.

### Preload resources

Experimental feature. Requires improvements.

`react-snap` can capture all required resources on the page and modify HTML, to instruct a browser to preload those resources.
- It will use `<link rel="preload" as="image">` for images.
- it will store `json` request to the same domain in `window.snapStore[<path>]`, where `<path>` is the path of json request

Use `preloadResources: true` to enable this feature.

## Recipes

See [recipes](Recipes.md) for more examples.

## Caveats

### Google Analytics, Mapbox, and other third-party requests

You can block all third-party requests with the following config

```
"skipThirdPartyRequests": false,
```

### WebGL

Headless chrome does not fully support WebGL, if you need render it you can use

```
"headless": false,
```

### Webpack 2+ and dynamic import

If you get following error `Uncaught ReferenceError: webpackJsonp is not defined`, you can use the following hack

```
"fixWebpackChunksIssue": true
```

### Error stack trace in production build

If you get an error in a production build, you can use sourcemaps to decode stack trace:

```
"sourceMaps": true
```

## TODO

- fail if any page fails
- Check if `200.html` is present in target directory and exit with error if it is already there
- [minimalcss css 404](https://github.com/peterbe/minimalcss/issues/2)
- [minimalcss path url resolution error](https://github.com/peterbe/minimalcss/issues/12)
- Improve `preconnect`, `dns-prefetch` functionality
- [Decide what is the optimal strategy for chunks](https://github.com/geelen/react-snapshot/issues/66#issuecomment-338923985)
- Do not load assets, the same way as minimalcss does
- Check deployments to [now](https://zeit.co/now#features)
- Check deployments to [surge](https://surge.sh/help/getting-started-with-surge)
- Evaluate [penthouse](https://github.com/pocketjoso/penthouse) as alternative to [minimalcss](https://github.com/peterbe/minimalcss)
