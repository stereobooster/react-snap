# react-snap [![Build Status](https://travis-ci.org/stereobooster/react-snap.svg?branch=master)](https://travis-ci.org/stereobooster/react-snap) [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg) [![Twitter Follow](https://img.shields.io/twitter/url/http/shields.io.svg?style=social&label=Follow)](https://twitter.com/stereobooster)

Pre-renders a web app into static HTML. Uses [Headless Chrome](https://github.com/GoogleChrome/puppeteer) to crawl all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get the best loading performance.

## 😍 Features

- Enables **SEO** (Google, DuckDuckGo...) and **SMO** (Twitter, Facebook...) for SPAs.
- **Works out-of-the-box** with [create-react-app](https://github.com/facebookincubator/create-react-app) - no code-changes required.
- Uses a **real browser** behind the scenes, so there are no issues with unsupported HTML5 features, like WebGL or Blobs.
- Does a lot of **load performance optimization**. [Here are details](doc/load-performance-optimizations.md), if you are curious.
- **Does not depend on React**. The name is inspired by `react-snapshot` but works with any technology (e.g., Vue).
- npm package does not have a compilation step, so **you can fork** it, change what you need, and install it with a GitHub URL.

**Zero configuration** is the main feature. You do not need to worry about how it works or how to configure it. But if you are curious, [here are details](doc/behind-the-scenes.md).

## Basic usage with create-react-app

Install:

```sh
yarn add --dev react-snap
```

Change `package.json`:

```json
"scripts": {
  "postbuild": "react-snap"
}
```

Change `src/index.js` (for React 16+):

```js
import { hydrate, render } from "react-dom";

const rootElement = document.getElementById("root");
if (rootElement.hasChildNodes()) {
  hydrate(<App />, rootElement);
} else {
  render(<App />, rootElement);
}
```

That's it!

## Basic usage with Preact

To do [hydration in Preact you need to use this trick](https://github.com/developit/preact/issues/1060#issuecomment-389987994):

```js
const rootElement = document.getElementById("root");
if (rootElement.hasChildNodes()) {
  preact.render(<App />, rootElement, rootElement.firstElementChild);
} else {
  preact.render(<App />, rootElement);
}
```

## Basic usage with Vue.js

Install:

```sh
yarn add --dev react-snap
```

Change `package.json`:

```json
"scripts": {
  "postbuild": "react-snap"
},
"reactSnap": {
  "source": "dist",
  "minifyHtml": {
    "collapseWhitespace": false,
    "removeComments": false
  }
}
```

Or use `preserveWhitespace: false` in `vue-loader`.

`source` - output folder of webpack or any other bundler of your choice

Read more about `minifyHtml` caveats in [#142](https://github.com/stereobooster/react-snap/issues/142).

Example: [Switch from prerender-spa-plugin to react-snap](https://github.com/stereobooster/prerender-spa-plugin/commit/ee73d39b862bc905b44a04c6eaa58e6730957819)

### Caveats

Only works with routing strategies using the HTML5 history API. No hash(bang) URLs.

Vue uses the `data-server-rendered` attribute on the root element to mark SSR generated markup. When this attribute is present, the VDOM rehydrates instead of rendering everything from scratch, which can result in a flash.

This is a small hack to fix rehydration problem:

```js
window.snapSaveState = () => {
  document.querySelector("#app").setAttribute("data-server-rendered", "true");
};
```

`window.snapSaveState` is a callback to save the state of the application at the end of rendering. It can be used for Redux or async components. In this example, it is repurposed to alter the DOM, this is why I call it a "hack." Maybe in future versions of `react-snap`, I will come up with better abstractions or automate this process.

### Vue 1.x

Make sure to use [`replace: false`](https://v1.vuejs.org/api/#replace) for root components

## ✨ Examples

- [Emotion website load performance optimization](doc/emotion-site-optimization.md)
- [Load performance optimization](doc/an-almost-static-stack-optimization.md)
- [recipes](doc/recipes.md)
- [stereobooster/an-almost-static-stack](https://github.com/stereobooster/an-almost-static-stack)

## ⚙️ Customization

If you need to pass some options for `react-snap`, you can do this in your `package.json` like this:

```json
"reactSnap": {
  "inlineCss": true
}
```

Not all options are documented yet, but you can check `defaultOptions` in `index.js`.

### inlineCss

Experimental feature - requires improvements.

`react-snap` can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a non-blocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

TODO: as soon as this feature is stable, it should be enabled by default.

## ⚠️ Caveats

### Async components

Also known as [code splitting](https://webpack.js.org/guides/code-splitting/), [dynamic import](https://github.com/tc39/proposal-dynamic-import) (TC39 proposal), "chunks" (which are loaded on demand), "layers", "rollups", or "fragments". See: [Guide To JavaScript Async Components](https://github.com/stereobooster/guide-to-async-components)

An async component (in React) is a technique (typically implemented as a higher-order component) for loading components on demand with the dynamic `import` operator. There are a lot of solutions in this field. Here are some examples:

- [`loadable-components`](https://github.com/smooth-code/loadable-components)
- [`react-loadable`](https://github.com/thejameskyle/react-loadable)
- [`react-async-component`](https://github.com/ctrlplusb/react-async-component)
- [`react-code-splitting`](https://github.com/didierfranc/react-code-splitting)

It is not a problem to render async components with `react-snap`, the tricky part happens when a prerendered React application boots and async components are not loaded yet, so React draws the "loading" state of a component, and later when the component is loaded, React draws the actual component. As a result, the user sees a flash:

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

`react-loadable` and `loadable-components` solve this issue for SSR. But only `loadable-components` can solve this issue for a "snapshot" setup:

```js
import { loadComponents, getState } from "loadable-components";
window.snapSaveState = () => getState();

loadComponents()
  .then(() => hydrate(AppWithRouter, rootElement))
  .catch(() => render(AppWithRouter, rootElement));
```

If you don't use babel plugin, [don't forget to provide modules](https://github.com/smooth-code/loadable-components/issues/114):

```js
const NotFoundPage = loadable(() => import("src/pages/NotFoundPage"), {
  modules: ["NotFoundPage"]
});
```

`loadable-components` were deprecated in favour of `@loadable/component`, but `@loadable/component` dropped `getState`. So if you want to use `loadable-components` you can use old version (`2.2.3` latest version at the moment of writing) or you can wait until `React` will implement proper handling of this case with asynchronous rendering and `React.lazy`.

### Redux

See: [Redux Server Rendering Section](https://redux.js.org/docs/recipes/ServerRendering.html#the-client-side)

```js
// Grab the state from a global variable injected into the server-generated HTML
const preloadedState = window.__PRELOADED_STATE__;

// Allow the passed state to be garbage-collected
delete window.__PRELOADED_STATE__;

// Create Redux store with initial state
const store = createStore(counterApp, preloadedState || initialState);

// Tell react-snap how to save Redux state
window.snapSaveState = () => ({
  __PRELOADED_STATE__: store.getState()
});
```

**Caution**: as of now, only basic "JSON" data types are supported: e.g. `Date`, `Set`, `Map`, and `NaN` **won't** be handled correctly ([#54](https://github.com/stereobooster/react-snap/issues/54)).

### Third-party requests: Google Analytics, Mapbox, etc.

You can block all third-party requests with the following config:

```json
"skipThirdPartyRequests": true
```

### AJAX

`react-snap` can capture all AJAX requests. It will store `json` requests in the domain in `window.snapStore[<path>]`, where `<path>` is the path of the request.

Use `"cacheAjaxRequests": true` to enable this feature.

This feature can conflict with the browser cache. See [#197](https://github.com/stereobooster/react-snap/issues/197#issuecomment-397893434) for details. You may want to disable cache in this case: `"puppeteer": { "cache": false }`.

### Service Workers

By default, `create-react-app` uses `index.html` as a fallback:

```json
navigateFallback: publicUrl + '/index.html',
```

You need to change this to an un-prerendered version of `index.html` - `200.html`, otherwise you will see `index.html` flash on other pages (if you have any). See [Configure sw-precache without ejecting](https://github.com/stereobooster/react-snap/blob/master/doc/recipes.md#configure-sw-precache-without-ejecting) for more information.

### Containers and other restricted environments

Puppeteer (Headless Chrome) may fail due to sandboxing issues. To get around this,
you may use:

```json
"puppeteerArgs": ["--no-sandbox", "--disable-setuid-sandbox"]
```

Read more about [puppeteer troubleshooting](https://github.com/GoogleChrome/puppeteer/blob/master/docs/troubleshooting.md).

`"inlineCss": true` sometimes causes problems in containers.

#### Docker + Alpine

To run `react-snap` inside `docker` with Alpine, you might want to use a custom Chromium executable. See [#93](https://github.com/stereobooster/react-snap/issues/93#issuecomment-354994505) and [#132](https://github.com/stereobooster/react-snap/issues/132#issuecomment-362333702).

#### Heroku

```
heroku buildpacks:add https://github.com/jontewks/puppeteer-heroku-buildpack.git
heroku buildpacks:add heroku/nodejs
heroku buildpacks:add https://github.com/heroku/heroku-buildpack-static.git
```

See this [PR](https://github.com/stereobooster/an-almost-static-stack/pull/7/files). At the moment of writing, Heroku doesn't support HTTP/2.

### Semantic UI

[Semantic UI](https://semantic-ui.com/) is defined over class substrings that contain spaces
(e.g., "three column"). Sorting the class names, therefore, breaks the styling. To get around this,
use the following configuration:

```json
"minifyHtml": { "sortClassName": false }
```

From version `1.17.0`, `sortClassName` is `false` by default.

### JSS

> Once JS on the client is loaded, components initialized and your JSS styles are regenerated, it's a good time to remove server-side generated style tag in order to avoid side-effects
>
> https://github.com/cssinjs/jss/blob/master/docs/ssr.md

This basically means that JSS doesn't support `rehydration`. See [#99](https://github.com/stereobooster/react-snap/issues/99) for a possible solutions.

### `react-router` v3

See [#135](https://github.com/stereobooster/react-snap/issues/135).

### userAgent

You can use `navigator.userAgent == "ReactSnap"` to do some checks in the app code while snapping—for example, if you use an absolute path for your API AJAX request. While crawling, however, you should request a specific host.

Example code:

```js
const BASE_URL =
  process.env.NODE_ENV == "production" && navigator.userAgent != "ReactSnap"
    ? "/"
    : "http://xxx.yy/rest-api";
```

## Alternatives

See [alternatives](doc/alternatives.md).

## Who uses it

| [![cloud.gov.au](doc/who-uses-it/cloud.gov.au.png)](https://github.com/govau/cloud.gov.au/blob/0187dd78d8f1751923631d3ff16e0fbe4a82bcc6/www/ui/package.json#L29) | [![blacklane](doc/who-uses-it/blacklane.png)](http://m.blacklane.com/) |     |
| ---------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------- | --- |


## Contributing

### Report a bug

Please provide a reproducible demo of a bug and steps to reproduce it. Thanks!

### Share on the web

Tweet it, like it, share it, star it. Thank you.

### Code

You can also contribute to [minimalcss](https://github.com/peterbe/minimalcss), which is a big part of `react-snap`. Also, give it some stars.
