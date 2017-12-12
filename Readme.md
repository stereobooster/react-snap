# react-snap [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg)

Pre-renders web app into static HTML. Uses headless chrome to pre-render. Crawls all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get best loading performance.

**Does not depend on React**. The name is inspired by `react-snapshot` and because the initial goal was to enable seamless integration with `create-react-app`. Actually, it works with any technology. Considering to change the name.

## Features

- Enables SEO (google, duckduckgo...) and SMO (twitter, facebook...) for SPA.
- Works out-of-the-box with [create-react-app](https://github.com/facebookincubator/create-react-app) - no code-changes required.
- Uses real browser behind the scene, so no issue with unsupported HTML5 features, like WebGL or Blobs.
- Crawls all pages starting from the root, no need to list pages by hand, like in `prep`.
- With prerendered HTML and inlined critical CSS you will get fast first paint, like with [critical](https://github.com/addyosmani/critical).
- With `precacheAjax` feature you will get faster first interaction time if your page does do AJAX requests.
- Works with webpack 2 code splitting feature, but with caveats. See below and [#46](https://github.com/stereobooster/react-snap/issues/46)
- [Handles sourcemaps](https://github.com/stereobooster/react-snap/issues/4)
- Supports non-root paths (e.g. for create-react-app relative paths)

Please note: some features are experimental, but prerendering is considered stable enough.

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

### inlineCss

Experimental feature - requires improvements.

`react-snap` can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

TODO: as soon as the feature will be stable it should be enabled by default.

### precacheAjax

Experimental feature - requires improvements.

`react-snap` can capture all AJAX requests. It will store `json` request to the same domain in `window.snapStore[<path>]`, where `<path>` is the path of json request.

Use `precacheAjax: true` to enable this feature.

## ✨ Recipes

See [recipes](Recipes.md) for more examples.

## ⚠️ Caveats

### Async components

Also known as code splitting, dynamic import

> Webpack has a feature to split your codebase into “chunks” which are loaded on demand. Some other bundlers call them “layers”, “rollups”, or “fragments”. This feature is called “code splitting”.
>
> — [Code splitting](https://webpack.github.io/docs/code-splitting.html)

[Dynamic import](https://github.com/tc39/proposal-dynamic-import) is the TC39 proposal.

Async component is a technique (typically implemented as a higher order component) for loading components with dynamic `import`. There are a lot of solutions in this field here are some examples:

- [`loadable-components`](https://github.com/smooth-code/loadable-components)
- [`react-loadable`](https://github.com/thejameskyle/react-loadable)
- [`react-async-component`](https://github.com/ctrlplusb/react-async-component)
- [`react-code-splitting`](https://github.com/didierfranc/react-code-splitting)

It is not a problem to render async component with react-snap, tricky part happens when prerendered React application boots and async components are not loaded yet, so React draws loading state of a component, later when component loaded react draws actual component. As the result - user sees a flash.

```
100%                    /----|    |----
                       /     |    |
                      /      |    |
                     /       |    |
                    /        |____|
  visual progress  /
                  /
0%  -------------/
```

This is a well-known problem. `react-loadable` and `loadable-components` solve this issue for SSR. But only `loadable-components` can solve this issue for "snapshot" setup:

```js
import { loadComponents } from "loadable-components";
import { getState } from "loadable-components/snap";
window.snapSaveState = () => getState();

loadComponents().then(() => {
  hydrate(AppWithRouter, rootElement);
});
```

### Redux

See: [Redux Srever Rendering Section](https://redux.js.org/docs/recipes/ServerRendering.html#the-client-side)

```js
// Grab the state from a global variable injected into the server-generated HTML
const preloadedState = window.__PRELOADED_STATE__

// Allow the passed state to be garbage-collected
delete window.__PRELOADED_STATE__

// Create Redux store with initial state
const store = createStore(counterApp, preloadedState || initialState)

// Tell react-snap how to save Redux state
window.snapSaveState = () => ({
  "__PRELOADED_STATE__": store.getState()
});
```

**Important**: as of now only basic "JSON" data types are supported e.g. Date, Set, Map, NaN won't be handled right.

TODO: use proper JS serializer ([#54](https://github.com/stereobooster/react-snap/issues/54)). See [this gist](https://gist.github.com/stereobooster/b2c9c543e794f3b927f82271b344ec72) for full list of alternatives.

### Google Analytics, Mapbox, and other third-party requests

You can block all third-party requests with the following config

```
"skipThirdPartyRequests": true
```

### WebGL

Headless chrome does not fully support WebGL, if you need render it you can use

```
"headless": false
```

### Containers and other restricted environments

Puppeteer (headless chrome) may fail due to sandboxing issues. To get around this,
you may use

```
"puppeteerArgs": ["--no-sandbox", "--disable-setuid-sandbox"]
```

Read more about [puppeteer troubleshooting.](https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md)

## TODO

- Update [recipes](Recipes.md) based on the code of [stereobooster/an-almost-static-stack](https://github.com/stereobooster/an-almost-static-stack)
- Improve [preconnect](http://caniuse.com/#feat=link-rel-preconnect), [dns-prefetch](http://caniuse.com/#feat=link-rel-dns-prefetch) functionality, maybe use [media queries](https://developer.mozilla.org/en-US/docs/Web/HTML/Preloading_content). Example: load in small screen - capture all assets, add with a media query for the small screen, load in big screen add the rest of the assets with a media query for the big screen.
- Do not load assets, the same way as minimalcss does
- Evaluate [penthouse](https://github.com/pocketjoso/penthouse) as alternative to [minimalcss](https://github.com/peterbe/minimalcss)

## Alternatives

- [Webcomponents SSR](https://youtu.be/yT-EsESAmgA)
- [prerender/prerender](https://github.com/prerender/prerender)
- [Simple express server for your Create React App projects with Server-side rendering and Code-splitting](https://github.com/antonybudianto/cra-universal). It seems it is similar to [razzle](https://github.com/jaredpalmer/razzle) - two webpack configs.
- https://github.com/LasaleFamine/pupperender
