const { mockFs } = require("./helper.js");
const { run } = require("./../index.js");
const snapRun = (fs, options) => {
  return run(
    {
      puppeteerArgs: ["--no-sandbox", "--disable-setuid-sandbox"],
      ...options
    },
    {
      fs
    }
  );
};

describe("validates options", () => {
  test("include option should be an non-empty array", () =>
    run({ include: "" })
      .then(() => expect(true).toEqual(false))
      .catch(e => expect(e).toEqual("")));

  test("preloadResources option deprecated. Use preloadImages or cacheAjaxRequests", () =>
    run({ preloadResources: true })
      .then(() => expect(true).toEqual(false))
      .catch(e => expect(e).toEqual("")));

  test("saveAs supported values are html and png", () =>
    run({ saveAs: "json" })
      .then(() => expect(true).toEqual(false))
      .catch(e => expect(e).toEqual("")));
});

describe("one page", async () => {
  const source = "tests/examples/one-page";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source
    });
  });
  test("crawls / and saves as index.html to the same folder", () => {
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
    await snapRun(fs, {
      source,
      destination
    });
  });
  test("crawls / and saves as index.html to destination folder", () => {
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
    await snapRun(fs, {
      source
    });
  });
  test("crawls all links and saves as index.html in separate folders", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(6);
    expect(writeFileSyncMock.mock.calls.map(x => x[0])).toEqual(
      expect.arrayContaining([
        `/${source}/1/index.html`, // without slash in the end
        `/${source}/2/index.html`, // with slash in the end
        `/${source}/3/index.html`, // ignores hash
        `/${source}/4/index.html` // ignores query
      ])
    );
  });
  test("crawls / and saves as index.html to the same folder", () => {
    expect(writeFileSyncMock.mock.calls[0][0]).toEqual(`/${source}/index.html`);
  });
  test("if there is more than page it crawls 404.html", () => {
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

describe("possible to disable crawl option", async () => {
  const source = "tests/examples/many-pages";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      crawl: false,
      include: ["/1", "/2/", "/3#test", "/4?test"]
    });
  });
  test("crawls all links and saves as index.html in separate folders", () => {
    // no / or /404.html
    expect(writeFileSyncMock.mock.calls.length).toEqual(4);
    expect(writeFileSyncMock.mock.calls.map(x => x[0])).toEqual(
      expect.arrayContaining([
        `/${source}/1/index.html`, // without slash in the end
        `/${source}/2/index.html`, // with slash in the end
        `/${source}/3/index.html`, // ignores hash
        `/${source}/4/index.html` // ignores query
      ])
    );
  });
  test("copies (original) index.html to 200.html", () => {
    expect(createReadStreamMock.mock.calls).toEqual([
      [`/${source}/index.html`]
    ]);
    expect(createWriteStreamMock.mock.calls).toEqual([[`/${source}/200.html`]]);
  });
});

describe("inlineCss - small file", async () => {
  const source = "tests/examples/other";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      inlineCss: true,
      include: ["/with-small-css.html"] //, "/with-big-css.html"]
    });
  });
  // 1. I want to change this behaviour
  // see https://github.com/stereobooster/react-snap/pull/133/files
  // 2. There is a bug with relative url in inlined CSS
  test("whole CSS got inlined for small", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(1);
    expect(writeFileSyncMock.mock.calls[0][1]).toMatchSnapshot();
  });
});

describe("inlineCss - big file", async () => {
  const source = "tests/examples/other";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      inlineCss: true,
      include: ["/with-big-css.html"]
    });
  });
  test("small portion got inlined, whole css file will be loaded asynchronously", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(1);
    expect(writeFileSyncMock.mock.calls[0][1]).toMatchSnapshot();
  });
});

describe("removeBlobs", async () => {
  const source = "tests/examples/other";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      include: ["/remove-blobs.html"]
    });
  });
  test("removes blob resources from final html", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(1);
    expect(writeFileSyncMock.mock.calls[0][1]).toMatchSnapshot();
  });
});

// describe("fixInsertRule", async () => {
//   const source = "tests/examples/other";
//   const {
//     fs,
//     writeFileSyncMock,
//     createReadStreamMock,
//     createWriteStreamMock
//   } = mockFs();
//   beforeAll(async () => {
//     await snapRun(fs, {
//       source,
//       include: ["/fix-insert-rule.html"]
//     });
//   });
//   test("fixes style tags populated with insertRule", () => {
//     expect(writeFileSyncMock.mock.calls.length).toEqual(1);
//     expect(writeFileSyncMock.mock.calls[0][1]).toMatchSnapshot();
//   });
// });

describe("http2PushManifest", async () => {
  const source = "tests/examples/other";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      include: ["/with-big-css.html"],
      http2PushManifest: true
    });
  });
  test("writes http2 manifest file", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(2);
    expect(writeFileSyncMock.mock.calls[1][1]).toMatchSnapshot();
  });
});

describe("ignoreForPreload", async () => {
  const source = "tests/examples/other";
  const {
    fs,
    writeFileSyncMock,
    createReadStreamMock,
    createWriteStreamMock
  } = mockFs();
  beforeAll(async () => {
    await snapRun(fs, {
      source,
      include: ["/with-big-css.html"],
      http2PushManifest: true,
      ignoreForPreload: ["big.css"]
    });
  });
  test("writes http2 manifest file", () => {
    expect(writeFileSyncMock.mock.calls.length).toEqual(2);
    expect(writeFileSyncMock.mock.calls[1][1]).toMatchSnapshot();
  });
});
