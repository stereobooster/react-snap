const nativeFs = require("fs");

const DevNullStream = require("dev-null-stream");
const cwd = process.cwd();

export const mockFs = () => {
  const devNullStream = new DevNullStream();
  const createReadStreamMock = jest.fn();
  const createWriteStreamMock = jest.fn();
  const writeFileSyncMock = jest.fn();
  const writeFileMock = jest.fn((file, data, cb) => (cb as any)());
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
    },
    writeFile: (path, content, cb) => {
      writeFileMock(path.replace(cwd, ""), content, cb);
    },
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
    writeFileMock,
    fs,
    // helpers
    filesCreated,
    content,
    name,
    names
  };
};
