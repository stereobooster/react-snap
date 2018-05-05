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
  return {
    createReadStreamMock,
    createWriteStreamMock,
    writeFileSyncMock,
    fs
  };
};

exports.mockFs = mockFs;
