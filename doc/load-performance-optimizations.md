# Load performance optimizations

## Works out of the box

### Prerendered HTML

`react-snap` prerenders HTML, so the browser can start to render content or download required resources ASAP.

### preconnect for third-party resources

`react-snap` tracks all third-party connections during rendering and will place appropriate preconnect links in the `header`.

### If you are using code splitting feature of Webpack

`react-snap` will remove chunk scripts from the HTML and instead will place preload links in the `header`.

### If you are using CSS-in-JS solution

`react-snap` will prerender all styles and save in the HTML.

## Requires configuration

This is a brief overview of what described in Readme and [recipes](recipes.md).

### inlineCss

With this configuration enabled `react-snap` will inline critical CSS and stylesheet links will be loaded in a nonblocking manner with the help of [loadCss](https://www.npmjs.com/package/fg-loadcss).

### cacheAjaxRequests

If you are doing AJAX requests (to the same domain), `react-snap` can cache this data in the window. Think of it as a poor man's Redux rehydration.

### http2PushManifest

`react-snap` can record all resources (scripts, styles, images) required for the page and write down this data to the JSON file. You can use this JSON file to generate HTTP2 server pushes or Link headers.

### If you are using Redux

Use `window.snapSaveState` callback to store Redux state, so it can be used to rehydrate on the client side.

### If you are using loadable-components

Use `window.snapSaveState` callback to store `loadable-components` state, so it can be used to rehydrate on the client side.

### If you are using Apollo

Use `window.snapSaveState` callback to store `Apollo` state, so it can be used to rehydrate on the client side.

**Caution**: I didn't test this one. If you use it please let me know.

```js
// Grab the state from a global variable injected into the server-generated HTML
const preloadedState = window.__APOLLO_STORE__

// Allow the passed state to be garbage-collected
delete window.__APOLLO_STORE__

const client = new ApolloClient({
  initialState: preloadedState,
});

// Tell react-snap how to save state
window.snapSaveState = () => ({
  "__APOLLO_STORE__": client.store.getState()
});
```
