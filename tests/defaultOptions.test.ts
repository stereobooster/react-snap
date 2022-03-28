import { defaultOptions } from "../src/defaults";

test("defaultOptions", () => {
  expect(defaultOptions).toMatchSnapshot();
});
