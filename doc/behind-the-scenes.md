# Behind the scenes

1. copies index.html as 200.html
2. starts local web server with your application (by default uses `/build` as a root)
3. visits `/` or any other pages listed in `include` configuration
4. find all links on the page with the same domain, add them to queue
5. If there is more than one page in the queue it also adds `/404.html` to the queue
6. renders the page with the help of puppeteer
7. waits till there are no active network requests for more than 0.5 second
8. removes webpack chunks, if needed
9. removes styles with blob URLs, if needed
10. recreates text for style tags for CSS-in-JS solutions, if needed
11. inlines critical CSS, if configured
12. collects assets for http2 push manifest, if configured
13. minifies HTML and saves it to the disk
14. if `route` ends with `.html` it will be used as is, otherwise `route/index.html` is used

## Other features

- `react-snap` works concurrently, by default it uses 4 tabs in the browser. Can be configured with `concurrency` option.
