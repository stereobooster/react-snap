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

## SEO-only server prerenderer

- [rendertron](https://github.com/GoogleChrome/rendertron)
- [prerender](https://github.com/prerender/prerender)
- [pupperender](https://github.com/LasaleFamine/pupperender)
- [spiderable-middleware](https://github.com/VeliovGroup/spiderable-middleware)

## Other

- [usus](https://github.com/gajus/usus)
- [puppetron](https://github.com/cheeaun/puppetron)
- [Webcomponents SSR](https://youtu.be/yT-EsESAmgA), [skatejs/ssr](https://github.com/skatejs/ssr)
- [Simple express server for your `create-react-app` projects with Server-side rendering and Code-splitting](https://github.com/antonybudianto/cra-universal). It seems it is similar to [razzle](https://github.com/jaredpalmer/razzle) - two webpack configs.
- [react-static](https://github.com/nozzle/react-static)
