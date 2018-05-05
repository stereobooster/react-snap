const { mockFs } = require("./helper.js");
const { run } = require("./../index.js");

describe("one page", async () => {
  const source = "tests/examples/one-page";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
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
  test("crawls index.html", () => {
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

describe("respects destination", async () => {
  const source = "tests/examples/one-page";
  const destination = "tests/examples/destination";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await run(
      {
        source,
        destination,
        puppeteerArgs: ["--no-sandbox", "--disable-setuid-sandbox"]
      },
      {
        fs
      }
    );
  });
  test("crawls index.html", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(1);
    expect(writeFileSyncMock.mock.calls[0][0]).toEqual(
      `/${destination}/index.html`
    );
  });
  test("copies (original) index.html to 200.html (to source folder)", () => {
    expect(createReadStreamMock.mock.calls[0]).toEqual([
      `/${source}/index.html`
    ]);
    expect(createWriteStreamMock.mock.calls[0]).toEqual([
      `/${source}/200.html`
    ]);
  });
  test("copies (original) index.html to 200.html (to destination folder)", () => {
    expect(createReadStreamMock.mock.calls[1]).toEqual([
      `/${source}/index.html`
    ]);
    expect(createWriteStreamMock.mock.calls[1]).toEqual([
      `/${destination}/200.html`
    ]);
  });
});

describe("many pages", async () => {
  const source = "tests/examples/many-pages";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
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
  test("crawls all links", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(6);
    expect(writeFileSyncMock.mock.calls.map(x => x[0])).toEqual(
      expect.arrayContaining([
        `/${source}/1/index.html`,
        `/${source}/2/index.html`,
        `/${source}/3/index.html`, // ignores hash
        `/${source}/4/index.html` // ignores query
      ])
    );
  });
  test("crawls index.html", () => {
    expect(writeFileSyncMock.mock.calls[0][0]).toEqual(`/${source}/index.html`);
  });
  test("crawls 404.html", () => {
    expect(writeFileSyncMock.mock.calls.map(x => x[0])).toEqual(
      expect.arrayContaining([`/${source}/404.html`])
    );
  });
  test("copies (original) index.html to 200.html", () => {
    expect(createReadStreamMock.mock.calls).toEqual([
      [`/${source}/index.html`]
    ]);
    expect(createWriteStreamMock.mock.calls).toEqual([[`/${source}/200.html`]]);
  });
});
