# react-snap [![npm](https://img.shields.io/npm/v/react-snap.svg)](https://www.npmjs.com/package/react-snap) ![npm](https://img.shields.io/npm/dt/react-snap.svg)

Pre-renders web app into static HTML. Uses headless chrome to prerender. Crawls all available links starting from the root. Heavily inspired by [prep](https://github.com/graphcool/prep) and [react-snapshot](https://github.com/geelen/react-snapshot), but written from scratch. Uses best practices to get best loading performance.

## Features

- Enables SEO (google, duckduckgo...) and SMO (twitter, facebook...) for SPA. Use [React Helmet](https://github.com/nfl/react-helmet) to generate meta tags.
- Works out-of-the-box with [create-react-app](https://github.com/facebookincubator/create-react-app) - no code-changes required. Also, can work with another setup or technology.
- Thanks to prerendered HTML and inlined critical CSS you will get very fast first paint. Functionality similar to [critical](https://github.com/addyosmani/critical).
- Thanks to `Preload resources` feature you will get fast first interaction time.

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

### Inline css

ReactSnap can inline critical CSS with the help of [minimalcss](https://github.com/peterbe/minimalcss) and full CSS will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

Use `inlineCss: true` to enable this feature.

Caveat: as of now `<noscript>` fallback not implemented. As soon it will be implemented, this feature will be enabled by default.

### Preload resources

ReactSnap can capture all required resources on the page and modify HTML, to instruct a browser to preload those resources.
- It will use `<link rel="preload" as="image">` for images.
- it will store `json` request to the same domain in `window.snapStore[<path>]`, where `<path>` is the path of json request

Use `preloadResources: true` to enable this feature.

## Recipes

See [recipes](Recipes.md) for more examples.

## TODO

- Check if `200.html` is present in target directory and exit with error if it is present
- Use [npm package for loadCss](https://www.npmjs.com/package/fg-loadcss) instead of vendoring it.
- Implement `noscript` fallback for loadCss trick
- Improve `preconnect`, `dns-prefetch` functionality
- [Decide what is the optimal strategy for chunks](https://github.com/geelen/react-snapshot/issues/66#issuecomment-338923985)
- [minimalcss hits google analytics](https://github.com/peterbe/minimalcss/issues/19)
- [minimalcss doesn't handle blob urls](https://github.com/peterbe/minimalcss/pull/18)
- [minimalcss css 404](https://github.com/peterbe/minimalcss/issues/2)
- [minimalcss path url resolution error](https://github.com/peterbe/minimalcss/issues/12)
- do not load assets
- forbid third party requests
- Add blog post with case study
- Tests
- Bug: gracefull shutdown doesn't work
- Check deployments to [now](https://zeit.co/now#features)
- Check deployments to [surge](https://surge.sh/help/getting-started-with-surge)
- Evaluate [penthouse](https://github.com/pocketjoso/penthouse) as alternative to [minimalcss](https://github.com/peterbe/minimalcss)

## Ideas

- Generate [AWS S3 redirects](http://sukharevd.net/static/files/blog/s3routes/index.html) from React Router Redirects.
