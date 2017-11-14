# react-snap [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg) [![Hacker News](https://img.shields.io/badge/Hacker%20News-Y-orange.svg)](https://news.ycombinator.com/item?id=15553863)

Pre-renders web app into static HTML. Uses headless chrome to pre-render. Crawls all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get best loading performance.

**Does not depend on React**. The name is inspired by `react-snapshot` and because the initial goal was to enable seamless integration with `create-react-app`. Actually, it works with any technology. Considering to change the name.

## Features

- Enables SEO (google, duckduckgo...) and SMO (twitter, facebook...) for SPA.
- Works out-of-the-box with [create-react-app](https://github.com/facebookincubator/create-react-app) - no code-changes required.
- Uses real browser behind the scene, so no issue with unsupported HTML5 features, like WebGL or Blobs.
- Crawls all pages starting from the root, no need to list pages by hand, like in `prep`.
- With prerendered HTML and inlined critical CSS you will get fast first paint, like with [critical](https://github.com/addyosmani/critical).
- With `Preload resources` feature you will get faster first interaction time if your page does do AJAX requests.
- [Works with webpack 2 code splitting feature](https://github.com/stereobooster/react-snap/issues/5)
- [Handles sourcemaps](https://github.com/stereobooster/react-snap/issues/4)
- Supports non-root paths (eg for create-react-app relative paths)

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

### Customization

If you need to pass some options for `react-snap`, you can do this in the `package.json`, like this:

```json
"reactSnap": {
  "inlineCss": true
}
```

All options are not documented yet, but you can check `defaultOptions` in `index.js`.

### Inline css

Experimental feature - requires improvements.

`react-snap` can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

TODO: as soon as the feature will be stable it should be enabled by default. As of now `<noscript>` fallback not implemented.

### Preload resources

Experimental feature - requires improvements.

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
"skipThirdPartyRequests": false
```

### WebGL

Headless chrome does not fully support WebGL, if you need render it you can use

```
"headless": false
```

### Webpack 2+ and dynamic import

If you get following error `Uncaught ReferenceError: webpackJsonp is not defined`, you can use the following hack

```
"fixWebpackChunksIssue": true
```

TODO: as soon as the feature will be stable it should be enabled by default.

### Error stack trace in production build

If you get an error in a production build, you can use sourcemaps to decode stack trace:

```
"sourceMaps": true
```

TODO: as soon as the feature will be stable it should be enabled by default.

## TODO

- Improve [preconnect](http://caniuse.com/#feat=link-rel-preconnect), [dns-prefetch](http://caniuse.com/#feat=link-rel-dns-prefetch) functionality, maybe use [media queries](https://developer.mozilla.org/en-US/docs/Web/HTML/Preloading_content). Example: load in small screen - capture all assets, add with a media query for the small screen, load in big screen add the rest of the assets with a media query for the big screen.
- Do not load assets, the same way as minimalcss does
- Check deployments to [now](https://zeit.co/now#features)
- Check deployments to [surge](https://surge.sh/help/getting-started-with-surge)
- Evaluate [penthouse](https://github.com/pocketjoso/penthouse) as alternative to [minimalcss](https://github.com/peterbe/minimalcss)
