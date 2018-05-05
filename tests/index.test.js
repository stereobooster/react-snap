const nativeFs = require("fs");

const rewiremock = require("rewiremock").default;
rewiremock("mkdirp").with({
  sync: (...args) => console.log(args)
});

const DevNullStream = require("dev-null-stream");
const devNullStream = new DevNullStream();

const cwd = process.cwd();
const writeFileSyncMock = jest.fn();
const fs = {
  existsSync: nativeFs.existsSync,
  createReadStream: nativeFs.createReadStream,
  createWriteStream: (...args) => devNullStream,
  writeFileSync: (path, content) => {
    writeFileSyncMock(path.replace(cwd, ""), content);
  }
};

const { run } = require("./../index.js");

rewiremock.enable();

test("one page test", async () => {
  await run(
    {
      source: "tests/examples/one-page",
      puppeteerArgs: ['--no-sandbox', '--disable-setuid-sandbox']
    },
    {
      fs
    }
  );
  expect(writeFileSyncMock.mock.calls.length).toEqual(1);
  expect(writeFileSyncMock.mock.calls).toMatchSnapshot();
});
