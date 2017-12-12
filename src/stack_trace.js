/*
 * This code is based on sourcemapped-stacktrace.js, but heavily modified
 *
 * sourcemapped-stacktrace.js
 * created by James Salter <iteration@gmail.com> (2014)
 *
 * https://github.com/novocaine/sourcemapped-stacktrace
 *
 * Licensed under the New BSD license. See LICENSE or:
 * http://opensource.org/licenses/BSD-3-Clause
 */

const fetch = require("node-fetch");
const SourceMapConsumer = require("source-map").SourceMapConsumer;

const absUrlRegex = new RegExp("^(?:[a-z]+:)?//", "i");

const onScriptLoad = async function(response, uri) {
  if (response.status === 200 || uri.slice(0, 7) === "file://") {
    // find .map in file.
    //
    // attempt to find it at the very end of the file, but tolerate trailing
    // whitespace inserted by some packers.
    const responseText = await response.text();
    const match = responseText.match("//# [s]ourceMappingURL=(.*)[\\s]*$", "m");
    if (match && match.length === 2) {
      // get the map
      let mapUri = match[1];

      const embeddedSourceMap = mapUri.match(
        "data:application/json;(charset=[^;]+;)?base64,(.*)"
      );

      if (embeddedSourceMap && embeddedSourceMap[2]) {
        return new SourceMapConsumer(atob(embeddedSourceMap[2]));
      } else {
        if (!absUrlRegex.test(mapUri)) {
          // relative url; according to sourcemaps spec is 'source origin'
          const lastSlash = uri.lastIndexOf("/");
          if (lastSlash !== -1) {
            const origin = uri.slice(0, lastSlash + 1);
            mapUri = origin + mapUri;
            // note if lastSlash === -1, actual script uri has no slash
            // somehow, so no way to use it as a prefix... we give up and try
            // as absolute
          }
        }

        try {
          const responseMap = await fetch(mapUri);
          if (responseMap.status === 200 || mapUri.slice(0, 7) === "file://") {
            return new SourceMapConsumer(await responseMap.text());
          }
        } catch (e) {}
      }
    }
  }
};

const sourceMaps = {};

const getSourceMapFor = uri => {
  if (sourceMaps[uri]) return sourceMaps[uri];

  return (sourceMaps[uri] = fetch(uri).then(response =>
    onScriptLoad(response, uri)
  ));
};

const origName = (origLine, opts) => {
  const match = String(origLine).match(
    opts.isChromeOrEdge || opts.isIE11Plus ? / +at +([^ ]*).*/ : /([^@]*)@.*/
  );
  return match && match[1];
};

const formatOriginalPosition = (source, line, column, name) => {
  // mimic chrome's format
  return `    at ${name ? name : "(unknown)"} (${source}:${line}:${column})`;
};

const processSourceMaps = (row, sourcemap, opts) => {
  const uri = row[1];
  const line = parseInt(row[2], 10);
  const column = parseInt(row[3], 10);

  if (!sourcemap) {
    // we can't find a map for that url, but we parsed the row.
    // reformat unchanged line for consistency with the sourcemapped
    // lines.
    return formatOriginalPosition(uri, line, column, origName(lines[i], opts));
  }

  // we think we have a map for that uri. call source-map library
  const origPos = sourcemap.originalPositionFor({ line: line, column: column });
  return formatOriginalPosition(
    origPos.source,
    origPos.line,
    origPos.column,
    origPos.name || origName(lines[i], opts)
  );
};

const config = opts => {
  const expected_fields = 4;
  let regex;
  if (opts.isChromeOrEdge || opts.isIE11Plus) {
    regex = /^ +at.+\((.*):([0-9]+):([0-9]+)/;
  } else if (opts.isFirefox || opts.isSafari) {
    regex = /@(.*):([0-9]+):([0-9]+)/;
  } else {
    throw new Error("unknown browser :(");
  }

  return { expected_fields, regex };
};

const processLineFactory = opts => {
  const { expected_fields, regex } = config(opts);

  return line => {
    const row = line.match(regex);
    if (row && row.length === expected_fields) {
      const uri = row[1];
      if (!uri.match(/<anonymous>|node_modules/) && uri.indexOf("/") !== -1) {
        return getSourceMapFor(uri)
          .then(sourcemap => processSourceMaps(row, sourcemap, opts))
          .catch(() => processSourceMaps(row, null, opts));
      } else {
        return Promise.resolve(processSourceMaps(row, null, opts));
      }
    }
    return Promise.resolve(line);
  };
};

const mapStackTrace = (stack, opts) => {
  return Promise.all(stack.split("\n").map(processLineFactory(opts)));
};

exports.default = mapStackTrace;
