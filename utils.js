const fs = require('fs');
const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)(e-?\d+)?$/i;
const dtypeRegex = /\s*([a-z]+)(8|16|32|64)\s*/i;

/**
 * @param {!Number} n
 * @param {!Number} [prec]
 * @returns {!String}
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
 * @param {!Number} n
 * @param {!Number} [prec]
 * @returns {!String}
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
 * @param {!Number|!String} xs
 * @returns {'s'|'f64'|'f34'|'i32'|'i16'|'i8'|'u32'|'u16'|'u8'} type marker
 * @private
 */
const getTypeMarker = val => {
  if (val.constructor.name[0] === 'S') {
    return 's';
  }
  const isFloat = !Number.isInteger(val);
  if (isFloat) {
    return `f${env.FLOAT_PREC}`;
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
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dt1
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dt2
 * @returns {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dtype
 * @private
 */
const unify = (dt1, dt2) => {
  if (dt1[0] === 's' || dt2[0] === 's') {
    return 's';
  } else if (dt1[0] === dt2[0]) {
    const nBits = Math.max(bitRegex.exec(dt1)[0], bitRegex.exec(dt2)[0]);
    return dt1[0] + nBits.toString();
  } else if (dt1[0] === 'f') {
    return dt1;
  } else if (dt2[0] === 'f') {
    return dt2;
  } else if (dt1[0] === 'i') {
    const bits1 = bitRegex.exec(dt1)[0];
    const bits2 = bitRegex.exec(dt2)[0];
    return `i${Math.min(32, Math.max(bits1, bits2 * 2))}`;
  } else if (dt2[0] === 'i') {
    const bits1 = bitRegex.exec(dt1)[0];
    const bits2 = bitRegex.exec(dt2)[0];
    return `i${Math.min(32, Math.max(bits1 * 2, bits2))}`;
  }
};

/**
 * @param {!Array<Array<*>>} xs
 * @returns {!Array<Array<*>>} xs^T
 * @private
 */
const transpose = xs => {
  /**
   * from [1, 2 , 3] to:
   *
   * [[1],
   *  [2],
   *  [3]]
   */
  if (xs[0].constructor.name !== 'Array') {
    return xs.map(x => [x]);
  }
  const colCount = xs[0].length; // assume equi-sized
  const rowCount = xs.length;
  const m = Array(colCount).fill(0).map(_ => Array(rowCount).fill(0));
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < xs[i].length; j++) {
      m[j][i] = xs[i][j];
    }
  }
  return m;
};

/**
 * @param {*} o
 * @param {!String} type
 * @returns {!Boolean}
 */
const checkType = (o, type) => {
  if (!o || !o.constructor || !o.constructor.name) {
    return false;
  }
  return o.constructor.name[0] === type[0];
};

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isString = o => checkType(o, 'String');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isNumber = o => checkType(o, 'Number');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isBoolean = o => checkType(o, 'Boolean');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isObject = o => checkType(o, 'Object');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isFunction = o => checkType(o, 'Function');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isMap = o => checkType(o, 'Map');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isURL = o => isString(o) && o.startsWith('http');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isFile = o => isString(o) && fs.existsSync(o);

/**
 * @param {*} o
 * @param {!String} ext
 * @returns {!Boolean}
 */
const isFileWithExt = (o, ext) => isFile(o) && o.endsWith(`.${ext}`);

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isFileJSON = (o) => isFileWithExt(o, 'json');

/**
 * @param {*} o
 * @returns {!Boolean}
 */
const isFileCSV = (o) => isFileWithExt(o, 'json');

/**
 * @param {*} o
 * @param {*} o2
 * @returns {!Boolean}
 */
const isSameType = (o, o2) => o && o2 && o.constructor && o2.constructor && o2.constructor.name === o.constructor.name;


module.exports = Object.freeze({
  dtypeRegex,
  fmtFloat,
  fmtFloatSI,
  isSameType,
  getTypeMarker,
  isBoolean,
  isFunction,
  isNumRegex,
  isURL,
  isFile,
  isNumber,
  isMap,
  isObject,
  isString,
  transpose,
  unify,
});
