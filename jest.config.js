module.exports = {
  globals: {
    'ts-jest': {},
  },
  moduleDirectories: [
    "node_modules"
  ],
  moduleFileExtensions: ['js', 'jsx', 'json', 'ts', 'tsx'],
  preset: 'ts-jest',
  testEnvironment: 'jsdom',
  // transformIgnorePatterns: [
  //   "/node_modules/(?!lodash/.*)"
  // ],
}