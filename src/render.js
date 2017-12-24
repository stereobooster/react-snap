'use strict';

Object.defineProperty(exports, "__esModule", {
  value: true
});
exports.render = undefined;

var _reactDom = require('react-dom');

var render = exports.render = function render(rootComponent, domElement) {
  if (navigator.userAgent === 'reactSnapRender' && window && window.reactSnapshotRender) {
    domElement.innerHTML = window.reactSnapRender(rootComponent);
  } else {
    if (domElement.hasChildNodes()) {
      (0, _reactDom.hydrate)(rootComponent, domElement);
    } else {
      (0, _reactDom.render)(rootComponent, domElement);
    }
  }
};
