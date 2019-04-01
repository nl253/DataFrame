// vim:hlsearch:nu:
/**
 * TODO mode is broken
 */
const util = require('util');
const { dirname, join } = require('path');
const { gunzipSync, gzipSync } = require('zlib');
const { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } = require('fs');

const Series = require('./Series');
const { randInt } = require('./rand');
const { readCSV } = require('./load');
const log = require('./log');

const bitRegex = /8|16|32|64/;

let PRINT_PRECISION = 2;
let HEAD_LEN = 5;
let FLOAT_PRECISION = 64;

/**
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dt1
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dt2
 * @returns {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dtype
 */
function unify(dt1, dt2) {
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
}

/**
 * @param {!Array<Array<*>>|!Array<*>} xs
 * @returns {!Array<Array<*>>|!Array<*>} transpose
 */
function transpose(xs) {
  if (xs[0].constructor.name !== 'Array') {
    return xs.map(x => [x]);
  }
  const colCount = xs[0].length;
  const rowCount = xs.length;
  const m = Array(colCount).fill(0).map(_ => Array(rowCount).fill(0));
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < xs[i].length; j++) {
      m[j][i] = xs[i][j];
    }
  }
  return m;
}

module.exports = class DataFrame {
  /**
   * @param {!DataFrame|!Object<!Array<!String>|!Array<!Number>>|!Array<!Array<!Number|!String>>|!Array<!TypedArray|!Array<!Number>|!Array<!String>>|!Map<!Array<!Number>|!Array<!String>>} data
   * @param {'cols'|'rows'|'map'|'obj'} [what]
   * @param {?Array<!String>} [colNames]
   */
  constructor(data = [], what = 'rows', colNames = null) {
    // empty
    if (data.length === 0) {
      this._cols = [];
      this.colNames = [];
      // another data frame, clone it
    } else if (data.constructor.name === this.constructor.name) {
      this._cols = Array.from(data._cols);
      this.colNames = Array.from(data.colNames);
      // object { colName => col, ... }
    } else if (data.constructor.name === 'Object' || what.startsWith('obj')) {
      this._cols = Object.values(data).map(c => Series.from(c));
      this.colNames = Object.keys(data);
      // map { colName => col, ... }
    } else if (data.constructor.name === 'Map' || what.startsWith('map')) {
      this._cols = Array.from(data.values()).map(c => Series.from(c));
      this.colNames = Array.from(data.keys());
    } else {
      // array of rows
      if (what.startsWith('row')) {
        this._cols = transpose(data).map(c => Series.from(c));
      // array of cols
      } else {
        this._cols = data.map(c => Series.from(c));
      }
      if (colNames === null) {
        this.colNames = Array(this.nCols).fill(0).map((_, idx) => idx);
      } else {
        this.colNames = colNames;
      }
    }

    const attrNames = new Set(this.colNames);
    // index using cols integers AND column names
    Array(this.nCols).fill(0).map((_, idx) => attrNames.add(idx));

    /*
     * easy access e.g. df.age, df.salary
     * easy replacement (assignment) of cols e.g. df.age = df2.age;
     */
    for (const name of attrNames) {
      Object.defineProperty(this, name, {
        get() {
          return this.col(name);
        },
        set(newCol) {
          // broadcast
          if (newCol.constructor.name === 'Number') {
            for (let i = 0; i < newCol.length; i++) {
              this._cols[this.colIdx(name)] = newCol[i];
            }
          } else {
            this._cols[this.colIdx(name)] = newCol;
          }
        },
      });
    }

    this.irow = function* (rIdx) {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        yield this.val(rIdx, cIdx);
      }
    };

    function* rowsIter() {
      for (let r = 0; r < this.length; r++) {
        yield this.row(r);
      }
    }

    // make this.rowsIter a getter
    Object.defineProperty(this, 'rowsIter', { get: rowsIter });
    this[Symbol.iterator] = rowsIter;

    // each produces a number from an array
    const aggsNum = [
      'mean',
      'median',
      'Q1',
      'Q3',
      'var',
      'stdev',
      'mad',
      'min',
      'max',
      'range',
      'IQR',
      'memory',
      'skewness',
      'kurosis',
    ];

    /*
     * each aggregare op is a function (Series => Number)
     * it changes the shape of the data frame from n x m => m x 2
     */
    for (const agg of aggsNum) {
      if (this[agg] === undefined) {
        this[agg] = function (...args) {
          return this.agg(agg, 'num', ...args);
        };
      }
    }

    if (this.mode === undefined) {
      this.mode = function (...args) {
        return this.agg('mode', 'all', ...args);
      };
    }

    /*
     * each forward function is forwarded to the underlying series
     * ForwardFunct :: Series (len = n) => Series (len = n)
     */
    for (const f of [
      'head', 'tail', 'map', 'reverse', 'zipWith', 'zipWith3',
    ]) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'all', ...args);
      };
    }

    for (const f of ['labelEncode', 'replace']) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'str', ...args);
      };
    }

    const functsNum = [
      'abs',
      'add',
      'cast',
      'ceil',
      'clip',
      'cube',
      'cum',
      'div',
      'downcast',
      'floor',
      'kBins',
      'mul',
      'normalize',
      'round',
      'square',
      'sub',
      'trunc',
    ];
    for (const f of functsNum) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'num', ...args);
      };
    }

    for (const pair of [
      ['add', 'sum'], ['sub', 'diff'], ['mul', 'prod'], ['div', 'quot'],
    ]) {
      const [op, name] = pair;
      if (this[name] === undefined) {
        this[name] = function (...args) {
          return this.agg(op, 'num', ...args);
        };
      }
    }
  }

  /**
   * @param {...!String|...!Number|Array<!Number|!String>} params pairs of colId, newName
   * @returns {!DataFrame} data frame with renamed col
   */
  rename(...params) {
    if (params.length === 1 && params[0].constructor.name === 'Array') {
      const pairs = params[0].map((newName, cIdx) => [cIdx, newName]);
      const args = pairs.reduce((pair1, pair2) => pair1.concat(pair2), []);
      return this.rename(...args);
    } else if (params.length === 1 && this.nCols === 1) {
      log.info('colId not specified for rename');
      return this.rename(0, params[0]);
    } else if (params.length % 2 !== 0) {
      throw new Error('you need to provide pairs of colId, newName (e.g. df.rename(1, "Width", -2, "Length"))');
    }
    const colNames = Array.from(this.colNames);
    for (let i = 1; i < params.length; i += 2) {
      const colId = params[i - 1];
      const newName = params[i];
      const colIdx = this.colIdx(colId);
      colNames[colIdx] = newName;
    }
    return new DataFrame(Array.from(this._cols), 'cols', colNames);
  }

  /**
   * @param {!Function|!String} [f]
   * @param {"all"|"num"|"str"|!Function} filter
   * @param args
   * @returns {!DataFrame} data frame
   */
  agg(f = xs => xs.length, filter = 'all', ...args) {
    const numCols = this._numColIdxs;
    if (filter === 'num') {
      return this.agg(f, cIdx => numCols.has(cIdx), ...args);
    } else if (filter === 'str') {
      return this.agg(f, cIdx => !numCols.has(cIdx), ...args);
    } else if (filter === 'all') {
      return this.agg(f, cIdx => true, ...args);
    }
    const colNames = [];
    const aggResults = [];
    if (f.constructor.name === 'String') {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (!filter(cIdx)) {
          continue;
        }
        const col = this._cols[cIdx];
        const colName = this.colNames[cIdx];
        colNames.push(colName);
        aggResults.push(col[f]());
      }
    } else {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (!filter(cIdx)) {
          continue;
        }
        const col = this._cols[cIdx];
        const colName = this.colNames[cIdx];
        colNames.push(colName);
        aggResults.push(f(col));
      }
    }
    return new DataFrame([colNames, aggResults],
      'cols',
      ['column', f.constructor.name === 'String' ? f : 'agg']);
  }

  /**
   * @param {!String|!Number} colId
   * @returns {!Number} column index
   */
  colIdx(colId) {
    // resolve named column
    if (Number.isInteger(colId)) {
      // resolve negative idx
      if (colId < 0) {
        return this.colIdx(this.nCols + colId);
      } else if (colId >= this.nCols) {
        throw new Error(`there is no column #${colId}, out of bounds`);
      } else {
        return colId;
      }
    } else {
      const idx = this.colNames.findIndex(colName => colName === colId);
      if (idx < 0) {
        throw new Error(`failed to find matching column for "${colId}"`);
      }
      return idx;
    }
  }

  /**
   * @param {!String|!Number} axisId
   * @returns {!Number} axis index
   */
  // axisIdx(axisId) {
    // if (axisId === 0 || axisId === 1) {
      // return axisId;
    // } else if (axisId < 0) {
      // return this.axisIdx(axisId + 2);
    // } else if (axisId.constructor.name === 'String') {
      // const fst = axisId.slice(0, 1);
      // if (fst.toLocaleLowerCase() !== fst) {
        // return this.axisId(fst.toLocaleLowerCase());
      // } else if (axisId.startsWith('col')) {
        // return 0;
      // } else if (axisId.startsWith('row')) {
        // return 1;
      // }
    // }
    // throw new Error(`unrecognised axis ${axisId}`);
  // }

  /**
   * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"|null} [dtype]
   * @param {?Array<!Number|!String>} [colNames]
   */
  transpose(dtype = null, colNames = null) {
    if (dtype === null) {
      const dt = this.dtypes.reduce((dt1, dt2) => unify(dt1, dt2));
      log.info(`inferred dtype = ${dt}`);
      return this.transpose(dt, colNames);
    }
    const cols = Array(this.length).fill(0).map(_ => Series.empty(this.nCols, dtype));
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      for (let rIdx = 0; rIdx < this.length; rIdx++) {
        cols[rIdx][cIdx] = this._cols[cIdx][rIdx];
      }
    }
    debugger;
    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @returns {!DataFrame} a correlation matrix
   */
  corr(withNames = true) {
    const numCols = this._numColIdxs;
    const colIdxs = [];
    const rows = [];
    for (let yIdx = 0; yIdx < this.nCols; yIdx++) {
      if (numCols.has(yIdx)) {
        colIdxs.push(yIdx);
        rows.push([]);
        for (let xIdx = 0; xIdx < this.nCols; xIdx++) {
          // every col is perfectrly correlated with itself (save some computation time)
          if (xIdx === yIdx) {
            rows[rows.length - 1].push(1);
          } else if (numCols.has(xIdx)) {
            const col = this._cols[yIdx];
            const other = this._cols[xIdx];
            const corr = col.corr(other);
            rows[rows.length - 1].push(corr);
          }
        }
      }
    }

    // numeric col names in the order of appearing in the matrix
    const colNames = this.colNames.filter((_, cIdx) => colIdxs.indexOf(cIdx) >= 0);

    /*
     * prepend a col with colum names to the left
     *    A1 A2 A3
     * A1
     * A2
     * A3
     */
    if (withNames) {
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        const colName = this.colNames[colIdxs[rIdx]];
        const row = rows[rIdx];
        rows[rIdx] = [colName].concat(row);
      }
      return new DataFrame(rows, 'rows', ['column'].concat(colNames));
    }
    // else
    return new DataFrame(rows, 'rows', colNames);
  }

  /**
   * @param {!Number} [n] number of cols to select
   * @param {"var"|"stdev"|"mean"|"mad"|"IQR"|"median"|"Q1"|"Q3"|"skewness"|"min"|"range"|"max"|!Function} [agg]
   */
  nBest(n = 5, agg = 'var') {
    if (n > this.nCols) {
      log.warn(`n = ${n}, but there is ${this.nCols} cols`);
      return this.nBest(this.nCols, agg);
    }

    let bestCols;

    if (agg.constructor.name === 'Function') {
      bestCols = this._cols.map((col, idx) => ({ idx, name: this.colNames[idx], score: agg(col) }));
    } else {
      bestCols = this._cols.map((col, idx) => ({ idx, name: this.colNames[idx], score: col[agg]() }));
    }

    bestCols = bestCols.sort((o1, o2) => (o1.score > o2.score ? -1 : o1.score < o2.score ? 1 : 0)).slice(0, n);

    if (bestCols.some(({ name }) => !name.toString().match(/\d+/))) {
      const colNames = [];
      const cols = [];
      for (const o of bestCols) {
        colNames.push(o.name);
        cols.push(this._cols[o.idx]);
      }
      return new DataFrame(cols, 'cols', colNames);
    } else {
      return new DataFrame(bestCols.map(({ idx }) => this._cols[idx]), 'cols');
    }
  }

  /**
   * @returns {!DataFrame} a data frame with numeric cols
   */
  get numeric() {
    return this.select(...this._numColIdxs);
  }

  /**
   * @returns {!DataFrame} a data frame with numeric cols
   */
  get nominal() {
    return this.select(...this._strColIdxs);
  }

  /**
   * @param {!String|!Number} colId
   * @returns {Array<String>|TypedArray} column
   */
  col(colId) {
    return this._cols[this.colIdx(colId)];
  }

  /**
   * @param {!Number} idx
   * @returns {!Array<*>} row
   */
  row(idx) {
    return Array(this.nCols)
      .fill(0)
      .map((_, cIdx) => this.val(idx, cIdx));
  }

  /**
   * @param {!Number} rowIdx
   * @param {!String|!Number} colId
   * @returns {!Number|!String} selects a val
   */
  val(rowIdx, colId) {
    return this.col(colId)[rowIdx];
  }

  /**
   * @param {!DataFrame} other
   * @returns {!DataFrame} data frame
   */
  concat(other, axis = 0) {
    if (axis < 0) {
      return this.concat(other, axis + 2);
    } else if (axis === 0) {
      const cols = Array.from(this._cols);
      const colNames = Array.from(this.colNames);
      for (let c = 0; c < this.nCols; c++) {
        cols[c] = cols[c].concat(other._cols[c]);
      }
      return new DataFrame(cols, 'cols', colNames);
    }

    // else if concat HORIZONTALLY {
    const isDigit = /^\d+$/; // check if has proper column names or just indexes
    let colNames;

    // if columns are indexes, shift them
    if (other.colNames.filter(c => c.toString().match(isDigit)).length === other.colNames.length) {
      colNames = this.colNames.concat(other.colNames.map(cIdx => this.colNames.length + cIdx));
    } else {
      colNames = this.colNames.concat(other.colNames);
    }

    let renamed;

    /*
     * deal with duplicate col names (add a num to the -- e.g.: Age, Salary, Age2 ...)
     * make sure that name clash didn't arise as a result of previous renaming {
     */
    do {
      renamed = false; // clear
      for (let cIdx = 0; cIdx < colNames.length; cIdx++) {
        const name = colNames[cIdx];
        let count = 2;
        for (let ptr = cIdx + 1; ptr < colNames.length; ptr++) {
          const name2 = colNames[ptr];
          if (name === name2) {
            colNames[ptr] += count.toString();
            renamed = true;
            count++;
          }
        }
      }
    } while (renamed);

    const cols = this._cols.concat(other._cols);
    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @param {!Number} n ratio or number of elements
   * @param {?Boolean} wr with replacement
   * @returns {!DataFrame} data frame
   */
  sample(n = 0.1, wr = true) {
    if (n <= 1) {
      return this.sample(Math.floor(n * this.length));
    } else if (n >= this.length) {
      log.warn('sample size >= nRows');
      return this.sample(this.length - 1, wr);
    }
    const rows = [];
    if (wr) {
      while (rows.length < n) {
        const rIdx = randInt(0, this.length);
        rows.push(this.row(rIdx));
      }
    } else {
      const idxs = Array(this.length).fill(0).map((_, idx) => idx);
      while (rows.length < n) {
        // this is a bit confusing because you are indexing an index
        const i = randInt(0, idxs.length);
        const rowIdx = idxs[i];
        const row = this.row(rowIdx);
        rows.push(row);
        idxs.pop(i); // remove i from possible idxs
      }
    }
    return new DataFrame(rows, 'rows', Array.from(this.colNames));
  }

  /**
   * @param {!Array<!String>|!Array<!Number>|TypedArray} col
   * @param {?String} [name]
   * @returns {!DataFrame} data frame
   */
  appendCol(col, name = null) {
    const colNames = Array.from(this.colNames);
    const cols = Array.from(this._cols);
    cols.push(col);
    if (name === null) {
      colNames.push(colNames.length);
    } else {
      colNames.push(name);
    }
    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @param {...<!Number|!String>} colIds
   * @return {!DataFrame} data frame
   */
  select(...colIds) {
    const cols = [];
    const colNames = [];

    for (const i of new Set(colIds.map(id => this.colIdx(id)))) {
      cols.push(this._cols[i]);
      colNames.push(this.colNames[i]);
    }

    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @returns {!Number} number of rows
   */
  get length() {
    if (this._cols[0] === undefined) {
      return 0;
    } else {
      return this._cols[0].length;
    }
  }

  /**
   * @returns {!Number} number of columns
   */
  get nCols() {
    return this._cols.length;
  }

  /**
   * @param {...!String} colIds
   * @returns {!Array<!String>|!String} data type for the column
   */
  dtype(...colIds) {
    if (colIds.length === 1) {
      return this._cols[this.colIdx(colIds[0])].dtype;
    } else if (colIds.length === 0) {
      return this.dtypes;
    } else {
      return colIds.map(c => this._cols[this.colIdx(c)].dtype);
    }
  }

  /**
   * @returns {!Array<!String>} data types for all columns
   */
  get dtypes() {
    return this._cols.map(c => c.dtype);
  }

  /**
   * @returns {!Set<!Number>} set of column indexes
   * @private
   */
  get _numColIdxs() {
    const { dtypes } = this;
    const colIdxs = new Set();
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      if (dtypes[cIdx] !== 's' && dtypes[cIdx] !== 'null') {
        colIdxs.add(cIdx);
      }
    }
    return colIdxs;
  }

  /**
   * @returns {!Set<!Number>} set of column indexes
   * @private
   */
  get _strColIdxs() {
    const numCols = this._numColIdxs;
    return new Set(this.colNames.filter((_, idx) => !numCols.has(idx)));
  }

  /**
   * @param {!Number|!String} colId
   * @param {!String|!Function} f
   * @param {"all"|"num"|"str"|!Function} filter
   * @param args
   * @returns {!DataFrame} data frame with f applied to colId
   */
  call(colId = null, f, filter = 'all', ...args) {
    if (colId === null) {
      log.info('colId not specified');
      if (this.nCols === 1) {
        log.info('running for the only col');
      } else {
        log.info('running for all cols');
      }
    }
    if (filter === 'num') {
      return this.call(colId, f, cIdx => this._numColIdxs.has(cIdx), ...args);
    } else if (filter === 'str') {
      return this.call(colId, f, cIdx => !this._numColIdxs.has(cIdx), ...args);
    } else if (filter === 'all') {
      return this.call(colId, f, cIdx => true, ...args);
    }
    const { dtypes } = this;
    const cols = Array.from(this._cols);
    const colIdxs = (colId === null ? this.colNames : [colId]).map(id => this.colIdx(id));
    if (f.constructor.name === 'String') {
      for (const cIdx of colIdxs) {
        if (!filter(cIdx)) {
          log.warn(`tried running op col #${cIdx}`);
        } else {
          cols[cIdx] = cols[cIdx][f](...args);
        }
      }
    } else {
      for (const cIdx of colIdxs) {
        if (!filter(cIdx)) {
          log.warn(`tried running op col #${cIdx}`);
        } else {
          cols[cIdx] = f(cols[cIdx], ...args);
        }
      }
    }
    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {...<!String|!Number>} cols col pairs
   * @returns {!DataFrame} data frame
   */
  sliceCols(...slices) {
    if (slices.length === 0) {
      throw new Error('no slice idxs specified (e.g. df.sliceCols(0, -1))');
    } else if (slices.length % 2 !== 0) {
      slices.push(this.nCols - 1); // odd number of idxs
      /*
       * e.g. sliceCols(0)         -> sliceCols(0, end)
       * e.g. sliceCols(0, 10, 20) -> sliceCols(0, 10, 20, end)
       */
    }

    // collect column idxs
    const colIds = new Set();

    for (let i = 1; i < slices.length; i += 2) {
      const lBound = this.colIdx(slices[i - 1]);
      const rBound = this.colIdx(slices[i]);
      for (let cIdx = lBound; cIdx <= rBound; cIdx++) {
        colIds.add(cIdx);
      }
    }

    // then select them
    return this.select(...colIds);
  }

  /**
   * @param {...!Number} idxs PAIRS of indexes
   * @returns {!DataFrame} a data frame
   */
  slice(...idxs) {
    if (idxs.length === 0) {
      throw new Error('you need to specify indexes (e.g. df.slice(0, 10), df.slice(-20, -10))');
    } else if (idxs.length % 2 !== 0) {
      idxs.push(this.length); // odd number of idxs
      /*
       * e.g. slice(0)         -> slice(0, end)
       * e.g. slice(0, 10, 20) -> slice(0, 10, 20, end)
       */
    }

    const cols = Array(this.nCols).fill(0);

    // for every pair of indexes
    for (let i = 1; i < idxs.length; i += 2) {
      const lBound = idxs[i - 1];
      const rBound = idxs[i];
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        const col = this._cols[cIdx];
        cols[cIdx] = col.subarray(lBound, rBound);
      }
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!Number|!String} colId
   * @param {'asc'|'des'|!Function} [ord]
   * @returns {DataFrame}
   */
  sort(colId = null, ord = 'asc') {
    if (colId === null) {
      if (this.nCols === 1) {
        return this.sort(0, ord);
      } else {
        throw new Error('you need to select a column (e.g. df.sort(0))');
      }
    }
    const cIdx = this.colIdx(colId);
    if (ord.constructor.name === 'Function') {
      return new DataFrame(Array.from(this.rowsIter).sort(ord), 'rows', Array.from(this.colNames));
    } else if (ord === 'asc') {
      return this.sort(cIdx, (r1, r2) => (r1[cIdx] > r2[cIdx] ? 1 : r1[cIdx] < r2[cIdx] ? -1 : 0));
    } else {
      return this.sort(cIdx, (r1, r2) => (r1[cIdx] > r2[cIdx] ? -1 : r1[cIdx] < r2[cIdx] ? 1 : 0));
    }
  }

  /**
   * @param {...<!String|!Number>} colIds
   * @returns {!DataFrame} data frame
   */
  dropOutliers(...colIds) {
    // by default compute for all (numeric) columns
    if (colIds.length === 0) {
      log.info('running dropOutliers for all cols');
      return this.dropOutliers(...this.colNames);
    }

    const cols = Array.from(this._cols);
    const numCols = this._numColIdxs;

    // indexes of *NUMERIC* columns
    const numColIdxs = new Set(colIds.map(id => this.colIdx(id)).filter(cIdx => numCols.has(cIdx)));

    // store {Q1, Q3, idx} for every *NUMERIC* column
    const IQRs = this.colNames
    // get column indexes
      .map((_, idx) => idx)
    // and now get all NUMERIC columns while leaving gaps to preserve indexing
      .map(idx => (numColIdxs.has(idx) ? this._cols[idx] : null))
    // and now computer IQ1 and IQ3 for all NUMERIC columns while leaving gaps to preserve indexing
      .map(maybeCol => (maybeCol === null ? null : ({ Q1: maybeCol.Q1(), Q3: maybeCol.Q3() })));

    // store results of testing for all rows
    const tests = Array(this.length).fill(true);

    // see if this row is an outlier by looking at each numeric column
    for (let rIdx = 0; rIdx < this.length; rIdx++) {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (!numColIdxs.has(cIdx)) continue;
        const col = cols[cIdx];
        const val = col[rIdx];
        // if value is in Q1 .. Q3 then accept
        if (val < IQRs[cIdx].Q1 || val > IQRs[cIdx].Q3) {
          tests[rIdx] = false;
          break;
        }
      }
    }

    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      // filter every col according to pre-computed boolean vals above
      cols[cIdx] = cols[cIdx].filter((_, rIdx) => tests[rIdx]);
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {...<!String|!Number>} colIds
   * @return {!DataFrame} data frame
   */
  drop(...colIds) {
    if (colIds.length === 0) {
      throw new Error('you need to select a column (e.g. df.drop(0, -2, -4))');
    }
    const toDelete = new Set(colIds.map(id => this.colIdx(id)));
    const neededCols = this.colNames
      .map((_, idx) => idx)
      .filter(cIdx => !toDelete.has(cIdx));

    return this.select(...neededCols);
  }

  /**
   * @param {!Function} f
   * @param {?String|?Number} [colId]
   * @returns {!DataFrame} data frame
   */
  filter(f = (_row, _idx) => true, colId = null) {
    if (colId === null) {
      const rows = [];
      for (const r of this.rowsIter) {
        if (f(r)) rows.push(r);
      }
      return new DataFrame(rows, 'rows', Array.from(this.colNames));
    }
    // else focus on one column
    const col = this.col(colId);
    const tests = Array(col.length).fill(false);
    for (let i = 0; i < col.length; i++) {
      tests[i] = f(col[i]);
    }
    const cols = Array.from(this._cols);
    for (let i = 0; i < this.nCols; i++) {
      cols[i] = cols[i].filter((_, idx) => tests[idx]);
    }
    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!String|!Number} colId
   * @param {!String|!Number} val
   * @param {">"|">="|"<"|"<="|"="} op
   * @returns {!DataFrame} data frame
   */
  where(val = null, colId = null, op = '=') {
    if (colId === null) {
      if (this.nCols === 1) {
        return this.where(val, 0, op);
      } else {
        throw new Error('no columns specified');
      }
    }
    if (op === '=') {
      return this.filter(x => x === val, colId);
    } else if (op === '>') {
      return this.filter(x => x > val, colId);
    } else if (op === '<') {
      return this.filter(x => x < val, colId);
    } else if (op === '<=') {
      return this.filter(x => x <= val, colId);
    } else if (op === '>=') {
      return this.filter(x => x >= val, colId);
    }
  }

  /**
   * @param {*} val
   * @param {...<!Number|!String>} colIds
   * @returns {!DataFrame} data frame without val in colIds
   */
  removeAll(val, ...colIds) {
    const tests = Array(this.length).fill(true);

    if (colIds.length === 0) {
      if (this.nCols === 0) {
        throw new Error('no columns to delete');
      } else {
        return this.removeAll(val, ...this.colNames);
      }
    }

    const colIdxs = colIds.map(id => this.colIdx(id));

    for (let i = 0; i < this.length; i++) {
      for (const cIdx of colIdxs) {
        const col = this._cols[cIdx];
        if (Object.is(col[i], val)) {
          tests[i] = false;
          break;
        }
      }
    }

    const cols = Array.from(this._cols);

    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      cols[cIdx] = cols[cIdx].filter((_, idx) => tests[idx]);
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * Shuffle the data frame.
   *
   * @returns {!DataFrame} data frame with shuffle rows
   */
  shuffle() {
    const rows = Series.from(Array.from(this.rowsIter)).shuffle();
    return new DataFrame(rows, 'rows', Array.from(this.colNames));
  }

  /**
   * Produce a count table for values of a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DataFrame} data frame of counts
   */
  counts(colId = null) {
    if (colId === null) {
      // only 1 column so unambiguous
      if (this.nCols === 1) {
        log.info('colId not specified for counts, but because there is only 1 col');
        return this.count(0);
      } else {
        throw new Error('you need to select a column (e.g. `df.counts(0)`)');
      }
    }
    const cIdx = this.colIdx(colId);
    return new DataFrame(
      Array.from(this._cols[cIdx].counts().entries()),
      'rows',
      [this.colNames[cIdx], 'count'],
    );
  }


  /**
   * One hot encode a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DataFrame} one hot encoded table
   */
  oneHot(colId = null) {
    if (colId === null) {
      if (this.nCols === 1) {
        log.info('colId not specified for oneHot, but because there is only 1 col');
        return this.oneHot(0);
      } else {
        throw new Error('you need to select a column (e.g. `df.oneHot(0)`)');
      }
    }
    const col = this.col(colId);
    const k = col.max() + 1;
    const cols = Array(k)
      .fill(0)
      .map(_ => Series.empty(col.length, 'u8'));
    for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
      const val = col[rowIdx];
      cols[val][rowIdx] = 1;
    }
    return new DataFrame(cols, 'cols');
  }

  /**
   * Summaries each column.
   *
   * @returns {DataFrame} data frame
   */
  summary() {
    const info = {
      column: Series.from([]),
      dtype: Series.from([]),
      min: Series.empty(this.nCols),
      max: Series.empty(this.nCols),
      range: Series.empty(this.nCols),
      mean: Series.empty(this.nCols),
      stdev: Series.empty(this.nCols),
    };

    const numCols = this._numColIdxs;

    for (let c = 0; c < this.nCols; c++) {
      info.column.push(this.colNames[c]);
      info.dtype.push(this.dtypes[c]);

      if (numCols.has(c)) {
        const col = this._cols[c];
        info.min[c] = col.min();
        info.max[c] = col.max();
        info.range[c] = info.max[c] - info.min[c];
        info.mean[c] = col.mean();
        info.stdev[c] = col.stdev();
      } else {
        for (const k of [
          'min', 'max', 'range', 'mean', 'stdev',
        ]) {
          info[k][c] = NaN;
        }
      }
    }
    return new DataFrame(info);
  }

  /**
   * @returns {!Object<Array<!Number>|!Array<!String>>} dictionary
   */
  toDict() {
    const dict = {};
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const cName = this.colNames[cIdx];
      const col = this._cols[cIdx];
      dict[cName] = Array.from(col);
    }
    return dict;
  }

  /**
   * @returns {!Array<Array<*>>} rows or cols as array
   */
  toArray(mode = 'rows') {
    return mode === 'rows'
      ? Array.from(this.rowsIter)
      : this._cols.map(c => Array.from(c));
  }

  /**
   * @returns {!String} json-stringified data frame
   */
  toJSON() {
    return JSON.stringify(this.toDict());
  }

  /**
   * @param {!String} fileName
   */
  toFile(fileName) {
    if (!fileName.endsWith('.df')) {
      log.warn('not a "*.df" file name');
    }
    const parent = dirname(fileName);
    if (!existsSync(parent)) {
      mkdirSync(parent);
    }
    writeFileSync(fileName, gzipSync(this.toJSON()), { flag: 'w' });
  }

  /**
   * @param {?Number} [n]
   * @param {?Number} [m]
   */
  print(n = null, m = null) {
    if (n === null) {
      const nRows = [HEAD_LEN, process.stdout.rows - 1 || HEAD_LEN, this.length].reduce((x, y) => Math.min(x, y));
      return this.print(nRows);
    } else if (m === null) {
      return this.print(0, n);
    } else if (m > this.length) {
      return this.print(n, this.length);
    }
    console.log(this.slice(n, m).toString(m - n));
  }

  /**
   * @returns {!DataFrame} shallow copy of the data frame
   */
  copy() {
    return new DataFrame(Array.from(this._cols), 'cols', Array.from(this.colNames));
  }

  /**
   * @param {"len"|"print"|"float"} k
   * @param {!Number} v
   */
  static set(k, v) {
    if (k.toLocaleLowerCase() !== k) {
      return DF.set(k.toLocaleLowerCase(), v);
    }
    if (k.match('print')) {
      PRINT_PRECISION = v;
    } else if (k.match('len')) {
      HEAD_LEN = v;
    } else if (k.match('float')) {
      FLOAT_PRECISION = v;
    } else {
      throw new Error(`unrecognised option "${k}"`);
    }
  }

  /**
   * @returns {!DataFrame} clone (deep copy) of the data frame
   */
  clone() {
    const newCols = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const col = this._cols[cIdx];
      newCols.push(col.clone());
    }
    return new DataFrame(newCols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!String} filePath
   * @param {?Boolean} [hasHeader]
   * @param {?Array<!String>} colNames
   * @returns {!DataFrame} data frame
   */
  static fromCSV(filePath, hasHeader = true, colNames = null) {
    if (!filePath.endsWith('.csv')) {
      log.warn('not a *.csv file');
    }
    const rows = readCSV(filePath, false); // assume for now it doesn't
    if (hasHeader) {
      const header = rows[0];
      return new DataFrame(rows.splice(1), 'rows', header);
    } else {
      return new DataFrame(rows.splice(1), 'rows');
    }
  }

  /**
   * @param {!String} filePath
   * @returns {!DataFrame} data frame
   */
  static fromFile(filePath) {
    if (!existsSync(filePath) && existsSync(`${filePath}.df`)) {
      return DataFrame.fromFile(`${filePath}.df`);
    }
    const json = JSON.parse(gunzipSync(readFileSync(filePath)).toString('utf-8'));
    const colNames = Object.keys(json);
    const isIndexed = colNames.map(nm => !!nm.match(/^\d+$/)).reduce((l, r) => l && r, true);
    return new DataFrame(
      Object.values(json),
      'cols',
      isIndexed ? colNames.map(parseFloat) : colNames,
    );
  }

  /**
   * @param {!String} name
   * @param {?Boolean} hasHeader
   * @param {?Array<!String>} colNames
   * @returns {!DataFrame} data frame
   */
  static loadDataSet(name, hasHeader = true, colNames = null) {
    return DataFrame.fromCSV(`${dirname(__filename)}/datasets/${name}/${name}.csv`, hasHeader, colNames);
  }

  /**
   * @returns {!String} datasets path
   */
  static get dataSetsPath() {
    return join(dirname(__filename), 'datasets');
  }

  /**
   * @returns {!Array<!String>} datasets
   */
  static get dataSets() {
    return readdirSync(DataFrame.dataSetsPath).filter(node => !node.match(/\.w+$/));
  }

  static of(...cols) {
    return new DataFrame(cols, 'cols');
  }

  [util.inspect.custom](depth, options) {
    return this.toString();
  }

  toHTML(indent = 2) {
    return `
      <table>
      ${' '.repeat(indent)}<tr>
      ${' '.repeat(indent * 2)}${this.colNames.map(name => `<th>${name.toString()}</th>`).join(`\n${' '.repeat(indent * 2)}`)}
    ${' '.repeat(indent)}</tr>
      ${' '.repeat(indent * 2)}${Array.from(this.rowsIter).map(r => `<tr>\n${' '.repeat(indent * 2)}${r.map(x => `<td>${x.toString()}</td>`).join(`\n${' '.repeat(indent * 2)}`)}\n${' '.repeat(indent)}</tr>`).join(`\n${' '.repeat(indent)}`)}
      </table>`;
  }

  toCSV(header = false) {
    const rows = [];
    if (header) {
      rows.push(this.colNames.join(','));
    }
    for (const r of this.rowsIter) {
      rows.push(r.map(x => x.toString()).join(','));
    }
    return rows.join('\n');
  }

  /**
   * @returns {!String} string representation of the data frame
   */
  toString(n = HEAD_LEN) {
    if (this.nCols === 0) {
      return 'Empty DataFrame';
    }
    const header = this.colNames;
    const rows = [];
    const nRows = Math.min(this.length, n);

    const numCols = this._numColIdxs;

    const parts = [];

    for (let i = 0; i < nRows; i++) {
      const row = this.row(i);
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        const val = row[cIdx];
        const s = val.toString();
        const isNum = numCols.has(cIdx);
        const maybePointIdx = s.indexOf('.');
        const hasRadixPoint = isNum && maybePointIdx >= 0;
        if (hasRadixPoint) {
          row[cIdx] = s.slice(0, maybePointIdx + PRINT_PRECISION + 1);
          if ((s.length - PRINT_PRECISION) === maybePointIdx) {
            row[cIdx] += '0';
          }
        } else if (!Object.is(val, NaN) && isNum && this.dtypes[cIdx].startsWith('f')) {
          row[cIdx] = `${s}.00`;
        }
      }
      rows.push(row);
    }

    const lens = Array(this.nCols)
      .fill(0)
      .map((_, idx) => Math.max(
        header[idx].toString().length,
        rows.map(r => r[idx].toString().length)
          .reduce((x, y) => Math.max(x, y), 1),
      ));

    parts.push(header.map((h, cIdx) => h.toString().padStart(lens[cIdx], ' ')).join(' '));

    parts.push(lens.map(l => '-'.repeat(l)).join(' '));

    for (let i = 0; i < nRows; i++) {
      parts.push(rows[i].map((val, cIdx) => val.toString().padStart(lens[cIdx], ' ')).join(' '));
    }

    if (this.length > n) {
      parts.push(` ... ${this.length - n} more`);
      parts[parts.length - 2] += `\n${lens.map(l => '-'.repeat(l)).join(' ')}`;
    }

    return parts.join('\n');
  }
};
