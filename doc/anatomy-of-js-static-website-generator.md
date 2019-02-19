# Anatomy of JavaScript static website generator

First of all, let's assume we have JavaScript application itself which is able to run on the client. Now we want to prerender our application to make the first paint faster, to make it crawlable by search engine bots and by social network bots.

## DOM

To prerender JavaScript a application we need either a virtual DOM like in React or a Node.js DOM implementation like JSDOM or a headless browser like a puppeteer.

### Virtual DOM with something like `renderToString`

**Examples**:

- `react-static` uses React's `renderToString` and `renderToStaticMarkup`

**Cons**:

- Works only with the chosen library, for example React in case of `react-static`
- Works only with components with SSR support, some components don't have it

**Pros**:

- It is possible to use caching, for example [`react-component-caching`](https://github.com/rookLab/react-component-caching)

### Node.js DOM library

**Examples**:

- `react-snapshot` uses React's `renderToString` and JSDOM
- `prerender-loader` uses JSDOM

**Cons**:

- Doesn't support some modern DOM features, for example, `Blob`
- Components which have SSR-specific logic most likely will not work as expected, for example, `react-ideal-image` on the server renders another way than on the client
- Need to write specific logic to exclude some client-side-only logic, for example, cookie consent or Google Analytics

### Headles

**Examples**:

- `react-snap` uses `puppeteer`

**Cons**:

- Components which have SSR-specific logic most likely will not work as expected, for example, `react-ideal-image` on the server renders another way than on the client
- Need to write specific logic to exclude some client-side-only logic, for example, cookie consent or Google Analytics

## Routes

Because we have a client-side application, most likely we deal with client-side routing, something like `react-router`. Next question is how our prerenderer will know what pages exist in the application. Possible options are manually list all pages, use some kind of programmatic generator or crawl the pages the same way as search engine bots do.

### Manually list routes

**Examples**:

- [`prerender-loader`](https://github.com/GoogleChromeLabs/prerender-loader/issues/6)
- [`prerender-spa-plugin`](https://github.com/chrisvfritz/prerender-spa-plugin)

**Cons**:

- we need to create and update routes manually

### Programmatic generator

**Examples**:

- `gatsby` (`createPages` in `gatsby-node.js`)
- `react-static` (`getRoutes` in `static.config.js`)
- `react-snap` - we can require it as lib and pass array of pages to the generator function

**Cons**:

- we need to create some config for the pages

### Crawl

**Examples**:

- `react-snap`
- `react-snapshot`

**Cons**:

- In some cases, if some routes cannot be discovered by a crawler we need to add those manually
- We may not want to render all the routes then we need to ignore those routes

## Data layer

If prerenderer is data layer agnostic or not?

### Data layer agnostic

**Examples**:

- `react-snap`
- `react-static`

**Pros**:

- we can use anything we are used to

### Not data layer agnostic

**Examples**:

- `gatsby`

**Cons**:

- We need to use a framework specific data layer, for example, in the case of Gatsby it is Graphql

## Data generator

### Without data generator

**Examples**:

- `react-snap`

### With data generator

**Examples**:

- `react-static` (`getData` in `static.config.js`)
- `gatsby` (`createNodes` in `gatsby-node.js`)

## Data rehydration

Now, once we have our application prerendered, the next question is how to properly rehydrate it. The main trick here is to recreate exactly the same state of the application as it was at the moment of HTML rendering, so rehydration would reuse existing markup as much as possible (ideally all of it). To do this we need to pass serialized state of the application.

### Redux

**Examples**:

- `react-snap` ([Redux example](https://github.com/stereobooster/react-snap#redux))

### Special data acсessor

**Examples**:

- `react-static` (`RouteProps`, `SiteProps`)
- `next.js` (`getInitialProps`)

### Cache AJAX requests

**Examples**:

- `react-snap` ([Cache AJAX requests example](https://github.com/stereobooster/react-snap#ajax))

## Webpack

Some of prerenderers are Webpack agnostic, some are implemented as Webpack plugin, others have it built-in.

### Webpack agnostic

**Examples**:

- `react-snap`

**Pros**:
- can be used with other bundlers, for example Parcel
- no need to change webpack config to use it, e.g. it is possible to use with create-react-app without ejecting

### Webpack plugin

**Examples**:

- `prerender-loader`
- `prerender-spa-plugin`

### Webpack built-in

**Examples**:

- `next.js`
- `react-static`
- `gatsby`

**Cons**:

- would require rewriting existing code unless you initially started with it

## Data source

Not necessarily part of the prerenderer but can be.

### Markdown, Front Matter, Git

Approach pioneered by Jekyll.

**Examples**:

- `react-static`
- `gatsby`

### Graphql as an interface to the file system

Approach pioneered by Gatsby.

**Examples**:

- `gatsby`

### Other

It can be anything like JSON files, JSON APIs etc
