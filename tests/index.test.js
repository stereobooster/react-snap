const nativeFs = require("fs");

const rewiremock = require("rewiremock").default;
rewiremock("mkdirp").with({
  sync: (...args) => console.log(args)
});

const DevNullStream = require("dev-null-stream");
const devNullStream = new DevNullStream();

const cwd = process.cwd();
const createReadStreamMock = jest.fn();
const createWriteStreamMock = jest.fn();
const writeFileSyncMock = jest.fn();

const fs = {
  existsSync: nativeFs.existsSync,
  createReadStream: path => {
    createReadStreamMock(path.replace(cwd, ""));
    return nativeFs.createReadStream(path);
  },
  createWriteStream: path => {
    createWriteStreamMock(path.replace(cwd, ""));
    return devNullStream;
  },
  writeFileSync: (path, content) => {
    writeFileSyncMock(path.replace(cwd, ""), content);
  }
};

const { run } = require("./../index.js");

rewiremock.enable();

describe("one page", async () => {
  const source = "tests/examples/one-page";
  beforeAll(async () => {
    await run(
      {
        source,
        puppeteerArgs: ["--no-sandbox", "--disable-setuid-sandbox"]
      },
      {
        fs
      }
    );
  });
  test("proceeds index.html", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(1);
    expect(writeFileSyncMock.mock.calls[0][0]).toEqual(`/${source}/index.html`);
    expect(writeFileSyncMock.mock.calls[0][1]).toMatchSnapshot();
  });
  test("copies (original) index.html to 200.html", () => {
    expect(createReadStreamMock.mock.calls).toEqual([
      [`/${source}/index.html`]
    ]);
    expect(createWriteStreamMock.mock.calls).toEqual([[`/${source}/200.html`]]);
  });
});
