# 1.23.0

- Potential fix for #301 illegal operation on a directory (#317)
- Disable ServiceWorker (#315)

# 1.22.1

- Fix bug introduced in 1.22.0 (#312 by @kjkta)

# 1.22.0

- Fix CRA2 compatibility (#264)

# 1.21.0

- Support in browser redirect (#292, #294, #296)
- Update dependency minimalcss to v0.8.1 (#300)
- Update dependency html-minifier to v3.5.21
- Update dependency puppeteerto ^v1.8.0
- Update dependency express to v4.16.4

# 1.20.0

- Added ability to save screenshots as jpeg. [#288](https://github.com/stereobooster/react-snap/pull/288) by @tsantef
- Fixed unclear message when there is no `<head>`. [#273](https://github.com/stereobooster/react-snap/pull/273) by @onionhammer
- Fixed broken SVG links. [#279](https://github.com/stereobooster/react-snap/pull/279) by @derappelt

# 1.19.0

- Fix `fixWebpackChunksIssue` for `react-scripts@2.0.0-next.a671462c` and later. [#252](https://github.com/stereobooster/react-snap/pull/252)
- Make sure that `vendors` chunk for `react-scripts@2.0.0-next.a671462c` and later is present in preload links. Push preload links before first style if `inlineCss` is true. [#254](https://github.com/stereobooster/react-snap/pull/254)
