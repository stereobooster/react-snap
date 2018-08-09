const { defaultOptions } = require("./../index.js");

test("defaultOptions", () => {
  expect(defaultOptions).toMatchSnapshot();
});
