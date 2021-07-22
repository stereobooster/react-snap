// FIX: tests are slow - use unit tests instead of integration tests
// TODO: capture console log from run function
const fs = require("fs");
const writeFileSpy = jest.spyOn(fs, "writeFile");
writeFileSpy.mockImplementation((file, data, cb) => cb());

const { mockFs } = require("./helper.js");
const { run } = require("./../index.js");
const snapRun = (fs, options) =>
  run(
    {
      // for Travis CI
      puppeteerArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
      // sometimes web server from previous test have not enough time to shut down
      // as a result you get `Error: listen EADDRINUSE :::45678`
      // to prevent this we use random port
      port: Math.floor(Math.random() * 1000 + 45000),
      ...options
    },
    {
      fs
    }
  );

describe("generateSitemap", () => {
    console.log('\n--describing generate sitemap test--\n')
    const source = "tests/examples/many-pages";
    const include = ["/index.html"];
    const { fs, filesCreated, content } = mockFs();
    beforeAll(() => snapRun(fs, { source, include }));
    test("removes blob resources from final html but sitemap", () => {
      console.log('--fs')
      console.log(fs)
      console.log('--content(0)')
      console.log(content(0))
      expect(content(0)).not.toMatch('<link rel="stylesheet" href="blob:');
    });
});

describe.skip("publicPath", () => {});

describe.skip("skipThirdPartyRequests", () => {});

describe.skip("waitFor", () => {});

describe.skip("externalServer", () => {});
