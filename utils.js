/* eslint-disable no-magic-numbers,max-lines,complexity */
const util = require('util');
const { statSync, readdirSync } = require('fs');
const { join, resolve } = require('path');

const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)(e-?\d+)?$/i;
const dtypeRegex = /\s*([a-z]+)(8|16|32|64)\s*/i;

/**
 * @param {number} n
 * @param {number} [prec]
 * @returns {string}
 * @private
 */
const fmtFloat = (n, prec = 2) => {
  if (Object.is(n, NaN)) {
    return 'NaN';
  }
  const s = n.toString();
  const maybePointIdx = s.indexOf('.');
  if (maybePointIdx >= 0) {
    const left = s.slice(0, maybePointIdx);
    const right = s.slice(maybePointIdx + 1, maybePointIdx + 1 + prec).padEnd(prec, '0');
    return `${left}.${right}`;
  } else {
    return `${s}.${'0'.repeat(prec)}`;
  }
};

/**
 * @param {number} n
 * @param {number} [prec]
 * @param {string} [unit]
 * @returns {string}
 * @private
 */
const fmtFloatSI = (n, prec = 2, unit = 'B') => {
  if (n >= 1e12) {
    return `${fmtFloat(n / 1e12, prec)}T${unit}`;
  } else if (n >= 1e9) {
    return `${fmtFloat(n / 1e9, prec)}G${unit}`;
  } else if (n >= 1e6) {
    return `${fmtFloat(n / 1e6, prec)}M${unit}`;
  } else if (n >= 1e3) {
    return `${fmtFloat(n / 1e3, prec)}K${unit}`;
  }
  return fmtFloat(n, prec) + unit;
};

/**
 *
 * @param {number|string} val
 * @returns {'s'|'f64'|'f34'|'i32'|'i16'|'i8'|'u32'|'u16'|'u8'} type marker
 * @private
 */
const getTypeMarker = (val) => {
  if (val.constructor.name[0] === 'S') {
    return 's';
  }
  const isFloat = !Number.isInteger(val);
  if (isFloat) {
    return `f${process.env.FLOAT_PREC}`;
  }
  let bitsNeeded = Math.ceil(Math.log(val + 1));
  const isNeg = val < 0;
  if (isNeg) bitsNeeded++;
  let bits = null;

  for (const bound of [32, 16, 8]) {
    if (bitsNeeded <= bound) {
      bits = bound;
    }
  }

  if (bits === null) {
    return 'f64';
  }

  const type = isNeg ? 'i' : 'u';
  return `${type}${bits}`;
};

/**
 * @param {Array<Array<*>>} xs
 * @returns {Array<Array<*>>} xs^T
 * @private
 */
const transpose = (xs) => {
  /**
   * from [1, 2 , 3] to:
   *
   * [[1],
   *  [2],
   *  [3]]
   */
  if (!Array.isArray(xs[0])) {
    return xs.map((x) => [x]);
  }
  const colCount = xs[0].length; // assume equi-sized
  const rowCount = xs.length;
  const m = Array(colCount).fill(0).map(() => Array(rowCount).fill(0));
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < xs[i].length; j++) {
      m[j][i] = xs[i][j];
    }
  }
  return m;
};

/**
 * @param {*} o
 * @param {string} type
 * @returns {boolean}
 */
const checkType = (o, type) => {
  if (o === null || o === undefined || o.constructor === undefined || o.constructor === null || o.constructor.name === undefined || o.constructor.name === null) {
    return false;
  }
  return o.constructor.name[0] === type[0];
};

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isString = (o) => checkType(o, 'String');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isRegExp = (o) => checkType(o, 'RegExp');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isNumber = (o) => checkType(o, 'Number');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isBoolean = (o) => checkType(o, 'Boolean');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isObject = (o) => checkType(o, 'Object');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isFunction = (o) => checkType(o, 'Function');

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isGenerator = (o) => util.types.isGeneratorFunction(o);

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isMap = (o) => util.types.isMap(o);

/**
 * @param {*} o
 * @returns {boolean}
 * @private
 */
const isURL = (o) => {
  if (isString(o) && o.slice(0, 4) === 'http') {
    const { host } = new URL(o);
    return host !== null;
  }
  return false;
};

/**
 * @param {*} o
 * @param {*} o2
 * @returns {boolean}
 * @private
 */
const isSameType = (o, o2) => o && o2 && o.constructor && o2.constructor && o2.constructor.name === o.constructor.name;

/**
 * @param {!string} root
 * @returns {IterableIterator<string>}
 * @private
 */
const walkFiles = function* (...root) {
  const nodeStack = [...root.map((p) => resolve(p))];
  while (nodeStack.length !== 0) {
    const path = nodeStack.pop();
    const stats = statSync(path);
    if (stats.isDirectory()) {
      for (const f of readdirSync(path)) {
        nodeStack.push(join(path, f));
      }
    } else if (stats.isFile()) {
      yield path;
    }
  }
};

module.exports = Object.freeze({
  dtypeRegex,
  fmtFloat,
  fmtFloatSI,
  getTypeMarker,
  isBoolean,
  isFunction,
  isGenerator,
  isMap,
  isNumRegex,
  isNumber,
  isObject,
  isRegExp,
  isSameType,
  isString,
  isURL,
  transpose,
  walkFiles,
});
