/**
 * TODO the API with appendCol / appendH / append(axis = 0) is very inconsistent and confusing
 * TODO there is no good map (all rows) / map (all cols) API
 * TODO fix kBins (it's too complicated & it doesn't work and the API is weird)
 * TODO fix labelEncode (do it via Series)
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

const PRECISION = 2;
const HEAD_LEN = 5;

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
   * @param {DataFrame|Object<Array<*>>|Array<*>|Array<Array<*>>} data
   * @param {'cols'|'rows'|'dict'} [what]
   * @param {?Array<!String>} [colNames]
   */
  constructor(data = [], what = 'rows', colNames = null) {
    if (data.length === 0) {
      this._cols = [];
      this.colNames = [];
    } else if (data.constructor.name === this.constructor.name) {
      this._cols = Array.from(data._cols);
      this.colNames = Array.from(data.colNames);
    } else if (data.constructor.name === 'Object' || what === 'dict') {
      this._cols = Object.values(data).map(c => Series.from(c));
      this.colNames = Object.keys(data);
    } else {
      if (what === 'rows') {
        this._cols = transpose(data).map(c => Series.from(c));
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

    this.irow =  function* (rIdx) {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        yield this.val(rIdx, cIdx);
      }
    }

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
      'magnitude',
    ];

    // each aggregare op is a function (Series => Number)
    // it changes the shape of the data frame from n x m => m x 2
    for (const agg of aggsNum) {
      if (this[agg] === undefined) {
        this[agg] = function (...args) {
          return this.aggNum(agg, ...args);
        };
      }
    }

    if (this.mode === undefined) {
      this.mode = function (...args) {
        return this.agg('mode', ...args);
      };
    }

    // each forward function is forwarded to the underlying series 
    // ForwardFunct :: Series (len = n) => Series (len = n)
    for (const f of ['head', 'tail', 'map', 'reverse', 'zipWith', 'zipWith3']) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, ...args);
      };
    }

    for (const f of ['labelEncode', 'replace']) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.callStr(colId, f, ...args);
      };
    }

    const functsNum = [
      'abs',          
      'add',
      'cast',
      'ceil',
      'clip',
      'cube',
      'downcast',
      'div',
      'floor',
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
        return this.callNum(colId, f, ...args);
      };
    }

    for (const pair of [['add', 'sum'], ['sub', 'diff'], ['mul', 'prod'], ['div', 'quot']]) {
      const [op, name] = pair;
      if (this[name] === undefined) {
        this[name] = function (...args) {
          return this.aggNum(op, ...args);
        };
      }
    }
  }

  /**
   * @param {...<?String|?Number>} params pairs of colId, newName
   * @returns {!DataFrame} data frame with renamed col
   */
  rename(...params) {
    if (params.length === 1 && this.nCols === 1) {
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
   * @param args
   * @returns {!DataFrame} data frame
   */
  agg(f = xs => xs.length, ...args) {
    const colNames = [];
    const aggResults = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const col = this._cols[cIdx];
      const colName = this.colNames[cIdx];
      colNames.push(colName);
      if (f.constructor.name === 'String') {
        aggResults.push(col[f]());
      } else {
        aggResults.push(f(col));
      }
    }
    return new DataFrame([colNames, aggResults], 'cols', ['column', f.constructor.name === 'String' ? f : 'agg']);
  }

  /**
   * @param {!Function|!String} [f]
   * @param args
   * @returns {!DataFrame} data frame
   */
  aggNum(f = xs => xs.length, ...args) {
    const colNames = [];
    const aggResults = [];
    const numCols = this._numColIdxs;
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      if (!numCols.has(cIdx)) {
        continue;
      }
      const col = this._cols[cIdx];
      const colName = this.colNames[cIdx];
      colNames.push(colName);
      if (f.constructor.name === 'String') {
        aggResults.push(col[f]());
      } else {
        aggResults.push(f(col));
      }
    }
    return new DataFrame([colNames, aggResults], 'cols', ['column', f.constructor.name === 'String' ? f : 'agg']);
  }

  /**
   * @param {!String|!Number} colId
   * @returns {!Number} column index
   * @private
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

    bestCols = bestCols.sort((o1, o2) => o1.score > o2.score ? -1 : o1.score < o2.score ? 1 : 0).slice(0, n);

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

    // deal with duplicate col names (add a num to the -- e.g.: Age, Salary, Age2 ...)
    // make sure that name clash didn't arise as a result of previous renaming {
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
   * @param {!Number|!String} colId
   * @param {!Function} f
   * @param {?Function} [f2]
   * @returns {!DataFrame} data frame
   */
  // mapCol(colId = null, f, dtype = 'f64') {
  // if (colId === null && this.nCols === 1) {
  // return this.mapCol(0, f, dtype);
  // }
  // const cIdx = this.colIdx(colId);
  // const cols = Array.from(this._cols);
  // const numCols = this._numColIdxs;
  // let mappedCol;
  // if (numCols.has(cIdx)) {
  // const col = cols[cIdx];
  // if (col.dtype === dtype || dtype === null) {
  // mappedCol = col.map(f);
  // } else {
  // mappedCol = col.cast(dtype).map(f);
  // }
  // } else {
  // mappedCol = cols[cIdx].map(f);
  // }
  // cols[cIdx] = mappedCol;
  // return new DataFrame(cols, 'cols', Array.from(this.colNames));
  // }

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
      colNames.push(name);
    } else {
      colNames.push(cpy.colNames.length);
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
    return new Set(Array(this.nCols).fill(0).map((_, idx) => idx).filter(cIdx => this._cols[cIdx].dtype.match(/8|16|32|64/)));
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
   * @returns {!DataFrame} data frame with f applied to colId
   */
  call(colId = null, f, ...args) {
    if (colId === null) {
      if (this.nCols === 1) {
        log.info(`colId not specified for ${f}, but there is only 1 col`);
        return this.call(0, f, ...args);
      } else {
        log.info(`colId not specified for ${f}, running for all cols`);
        let df = this;
        for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
          df = df.call(cIdx, f, ...args);
        }
        return df;
      }
    }
    const cols = Array.from(this._cols);
    const cIdx = this.colIdx(colId);
    if (f.constructor.name === 'String') {
      cols[cIdx] = cols[cIdx][f](...args);
    } else {
      cols[cIdx] = f(cols[cIdx], ...args);
    }
    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!Number|!String} colId
   * @param {!String} f
   * @returns {!DataFrame} data frame with f applied to colId
   */
  callNum(colId = null, f, ...args) {
    if (colId === null) {
      if (this.nCols === 1) {
        log.info(`colId not specified for ${f}, but there is only 1 col`);
        return this.callNum(0, f, ...args);
      } else {
        log.info(`colId not specified for ${f}, running for all cols`);
        let df = this;
        for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
          df = df.callNum(cIdx, f, ...args);
        }
        return df;
      }
    }
    const cIdx = this.colIdx(colId);

    if (this._cols[cIdx].constructor.name === 'Array') {
      log.warn(`tried running num-op ${f} on non-num col #${cIdx}`);
      return this;
    }

    const cols = Array.from(this._cols);

    if (f.constructor.name === 'String') {
      cols[cIdx] = cols[cIdx][f](...args);
    } else {
      cols[cIdx] = f(cols[cIdx], ...args);
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!Number|!String} colId
   * @param {!String} f
   * @returns {!DataFrame} data frame with f applied to colId
   */
  callStr(colId = null, f, ...args) {
    if (colId === null) {
      if (this.nCols === 1) {
        log.info(`colId not specified for ${f}, but there is only 1 col`);
        return this.callStr(0, f, ...args);
      } else {
        log.info(`colId not specified for ${f}, running for all cols`);
        let df = this;
        for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
          df = df.callStr(cIdx, f, ...args);
        }
        return df;
      }
    }

    const cIdx = this.colIdx(colId);

    if (this._cols[cIdx].constructor.name !== 'Array') {
      log.warn(`tried running string-op ${f} on non-string col #${cIdx}`);
      return this;
    }

    const cols = Array.from(this._cols);

    if (f.constructor.name === 'String') {
      cols[cIdx] = cols[cIdx][f](...args);
    } else {
      cols[cIdx] = f(cols[cIdx], ...args);
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
      slices.push(this.nCols); // odd number of idxs
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
      for (let cIdx = lBound; cIdx < rBound; cIdx++) {
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
      return this.sort(cIdx, (r1, r2) => r1[cIdx] > r2[cIdx] ? 1 : r1[cIdx] < r2[cIdx] ? -1 : 0);
    } else {
      return this.sort(cIdx, (r1, r2) => r1[cIdx] > r2[cIdx] ? -1 : r1[cIdx] < r2[cIdx] ? 1 : 0);
    }
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
   * @param {...<!Number|!String>} [params]
   */
  // kBins(...params) {
  // if (params.length === 0) {
  // log.warn('nBins not specified, defaulting to 6 bins');
  // params = [6];
  // } else if (params.length === 1) {
  // // if 1 param assume it 's the bin size
  // // and k - bin all columns
  // const k = params[0];
  // log.info(`not selected specific cols so binning all attrs with k = ${k}`);
  // return this.kBins(this.colNames
  // .map((_, idx) => [idx, k])
  // .reduce((a1, a2) => a1.concat(a2), []));
  // }

  // const cols = Array.from(this._cols);

  // // kBins(colId_1, nBins_1, colId_2, nBins_2, ...)
  // for (let i = 1; i < params.length; i += 2) {
  // const colId = params[i - 1];
  // const cIdx = this.colIdx(colId);
  // const k = params[i];
  // const binSize = Math.floor(this.length / k);
  // const col = cols[cIdx];
  // const colSorted = col.clone().sort()
  // const bitsPerVal = Math.ceil(Math.log2(k));
  // const newArr = Series.empty(
  // bitsPerVal <= 8 ? 'u8' : bitsPerVal <= 16 ? 'u16' : 'u32', col.length,
  // );
  // const bounds = Series.empty('f64', k);

  // // determine boundaries
  // for (let rowIdx = binSize; rowIdx < col.length; rowIdx += binSize) {
  // bounds[rowIdx / binSize] = colSorted[rowIdx];
  // }

  // // last bin captures all
  // bounds[bounds.length - 1] = Infinity;

  // log.debug(`bounds: [${bounds.join(', ')}]`);

  // for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
  // const val = col[rowIdx];
  // for (let b = 0; b < bounds.length; b++) {
  // if (val <= bounds[b]) {
  // newArr[rowIdx] = b;
  // break;
  // }
  // }
  // }

  // cols[cIdx] = newArr;
  // }

  // return new DataFrame(cols, 'cols', Array.from(this.colNames));
  // }

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
      cols[cIdx] = cols[cIdx].filter((_, idx) => tests[idx])
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
      debugger;

      if (numCols.has(c)) {
        const col = this._cols[c];
        info.min[c] = col.min();
        info.max[c] = col.max();
        info.range[c] = info.max[c] - info.min[c];
        info.mean[c] = col.mean();
        info.stdev[c] = col.stdev();
      } else {
        for (const k of ['min', 'max', 'range', 'mean', 'stdev']) {
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
    if (!filePath.match(/\.csv/i)) {
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

  /**
   * @returns {!String} string representation of the data frame
   */
  toString(n = HEAD_LEN) {
    if (this.nCols === 0) {
      return 'Empty DataFrame';
    }
    const header = this.colNames;
    const rows = []
    const nRows = Math.min(this.length, n);

    const parts = [];

    for (let i = 0; i < nRows; i++) {
      const row = this.row(i);
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (row[cIdx].constructor.name === 'Number' && row[cIdx].toString().match(/\./)) {
          const [p1, p2] = row[cIdx].toString().split('.');
          row[cIdx] = p1 + '.' + p2.slice(0, PRECISION);
        }
      }
      rows.push(row);
    }

    const lens = Array(this.nCols)
      .fill(0)
      .map((_, idx) => 
        Math.max(
          header[idx].toString().length, 
          rows.map(r => r[idx].toString().length)
          .reduce((x, y) => Math.max(x, y), 1)));

    parts.push(header.map((h, cIdx) => h.toString().padStart(lens[cIdx], ' ')).join(' '));

    parts.push(lens.map(l => '-'.repeat(l)).join(' '));

    for (let i = 0; i < nRows; i++) {
      parts.push(rows[i].map((val, cIdx) => val.toString().padStart(lens[cIdx], ' ')).join(' '));
    }

    if (this.length > n) {
      parts.push(` ... ${this.length - n} more`);
      parts[parts.length - 2] += '\n' + lens.map(l => '-'.repeat(l)).join(' ')
    }

    return parts.join('\n');
  }
};
