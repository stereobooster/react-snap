const nativeFs = require("fs");

const DevNullStream = require("dev-null-stream");
const cwd = process.cwd();

const mockFs = () => {
  const devNullStream = new DevNullStream();
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
  const filesCreated = () => writeFileSyncMock.mock.calls.length;
  const name = index => writeFileSyncMock.mock.calls[index][0];
  const content = index => writeFileSyncMock.mock.calls[index][1];
  const names = () => writeFileSyncMock.mock.calls.map(x => x[0]);
  return {
    // mocks
    createReadStreamMock,
    createWriteStreamMock,
    writeFileSyncMock,
    fs,
    // helpers
    filesCreated,
    content,
    name,
    names
  };
};

exports.mockFs = mockFs;
