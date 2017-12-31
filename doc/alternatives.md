# Alternatives

## Prerendering, snapshoting

|                               | react-snap | [prerender-spa-plugin][prerender-spa-plugin] | [react-snapshot][react-snapshot] | [prep][prep] | [snapshotify][snapshotify] |
|-------------------------------|------------|----------------------------------------------|----------------------------------|--------------|----------------------------|
| State                         | supported  | looking for maintainer                       | unsupported                      | unsupported  | experimental               |
| DOM implementation            | Puppeteer  | phantomjs                                    | JSDOM                            | nightmare    | Puppeteer                  |
| Doesn't depend on Webpack     | +          | -                                            | +                                | +            | +                          |
| Doesn't depend on React       | +          | +                                            | -                                | +            | -                          |
| Load performance optimisation | +          | -                                            | -                                | -            | +                          |
| Zero-configuration            | +          | -                                            | +                                | -            | +                          |
| Redux                         | +          | -                                            | +                                | -            | -                          |
| Assync components             | +          | -                                            | -                                | -            | +                          |
| Webpack code splitting        | +          | [+][code-splitting]                          | -                                | -            | +                          |
| `CSSStyleSheet.insertRule`    | +          | -                                            | -                                | -            | +                          |
| blob urls                     | +          | ?                                            | -                                | -            | -                          |
| All browser features          | +          | -                                            | -                                | ?            | +                          |

[prerender-spa-plugin]: https://github.com/chrisvfritz/prerender-spa-plugin
[react-snapshot]: https://github.com/geelen/react-snapshot
[prep]: https://github.com/graphcool/prep
[snapshotify]: https://github.com/errorception/snapshotify
[code-splitting]: https://github.com/chrisvfritz/prerender-spa-plugin#code-splitting

- Load performancs optimisation - something beyond rendering HTML, like critical CSS
- Zero-configuration - provides sensible defaults
- **Redux** - can save state at the end of redering
- **assync components** - can save state of async componets to prevent flash on the client side
- `insertRule` - Works with CSS-in-JS solutions which use `CSSStyleSheet.insertRule`
- **blob urls** - removes blob urls from generated HTML

TODO: add [static-site-generator-webpack-plugin](https://github.com/markdalgleish/static-site-generator-webpack-plugin) to comparison.

## SEO-only server prerenderers

- [rendertron](https://github.com/GoogleChrome/rendertron)
- [prerender](https://github.com/prerender/prerender)
- [puppetron](https://github.com/cheeaun/puppetron)
- [pupperender](https://github.com/LasaleFamine/pupperender)
- [spiderable-middleware](https://github.com/VeliovGroup/spiderable-middleware)

## React static site generators

- [gatsby](https://github.com/gatsbyjs/gatsby)
- [phenomic](https://github.com/phenomic/phenomic)
- [react-static](https://github.com/nozzle/react-static)

## WebComponents

- [talk: WebComponents SSR](https://youtu.be/yT-EsESAmgA)
- [skatejs/ssr](https://github.com/skatejs/ssr)
- [rendertron#web-components](https://github.com/GoogleChrome/rendertron#web-components)
- [shadydom](https://github.com/webcomponents/shadydom)

## Other

- [usus](https://github.com/gajus/usus)
- [Simple express server for your `create-react-app` projects with Server-side rendering and Code-splitting](https://github.com/antonybudianto/cra-universal). It seems it is similar to [razzle](https://github.com/jaredpalmer/razzle) - two webpack configs.

