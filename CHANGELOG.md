# 1.19.0

* Fix `fixWebpackChunksIssue` for `react-scripts@2.0.0-next.a671462c` and later. [#252](https://github.com/stereobooster/react-snap/pull/252)
* Make sure that `vendors` chunk for `react-scripts@2.0.0-next.a671462c` and later is present in preload links. Push preload links before first style if `inlineCss` is true. [#254](https://github.com/stereobooster/react-snap/pull/254)