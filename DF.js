const { dirname, join } = require('path');
const { gunzipSync, gzipSync } = require('zlib');
const { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } = require('fs');

// noinspection JSUnusedLocalSymbols
const Series = require('./Series');
const { readCSV } = require('./load');
const log = require('./log');

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
  const m = Array(colCount)
    .fill(0)
    .map(_ => Array(rowCount)
      .fill(0));
  for (let i = 0; i < xs.length; i++) {
    for (let j = 0; j < xs[i].length; j++) {
      m[j][i] = xs[i][j];
    }
  }
  return m;
}


class DF {
  /**
   * @param {DF|Object<Array<*>>|Array<*>|Array<Array<*>>} data
   * @param {'cols'|'rows'|'dict'} [what]
   * @param {?Array<!String>} [colNames]
   */
  constructor(data = [], what = 'rows', colNames = null) {
    /*
     * accept data in 3 modes:
     * - list of columns Array<Array<*>>,
     * - list of rows Array<Array<*>,
     * - null OR undefined data (create an empty DF)
     * - Object<!String, !Array<*>> (dict key => col)
     * - a DF (just shallow clone it)
     */
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
        this._cols = t(data).map(c => Series.from(c));
      } else {
        this._cols = data.map(c => Series.from(c));
      }
      if (colNames) {
        this.colNames = colNames;
      } else {
        this.colNames = Array(this.nCols).fill(0).map((_, idx) => idx);
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
          this._cols[this._resolveCol(name)] = newCol;
        },
      });
    }

    function* iterator() {
      for (let r = 0; r < this.length; r++) {
        yield this.row(r);
      }
    }

    // make this.rowIter a getter
    Object.defineProperty(this, 'rowIter', { get: iterator });
    this[Symbol.iterator] = iterator;

    // each produces a number from an array
    const aggOps = [
      'mean',
      'median',
      'variance',
      'stdev',
      'mad',
      'min',
      'max',
      'range',
      'sum',
      'product',
      'dot',
      'mae',
      'skewness',
    ];

    for (const o of aggOps.filter(agg => this[agg] === undefined).map(agg => ({ aggName: agg, f: eval(agg) }))) {
      this._registerNumAgg(o.aggName, o.f);
    }
    if (this.mode === undefined) {
      this._registerAgg('mode', mode);
    }
  }

  /**
   * @param {!String} aggName
   * @param {!Function} f
   * @private
   */
  _registerAgg(aggName, f) {
    Object.defineProperty(this, aggName, {
      get() {
        const colNames = [];
        const newCols = [];
        const colIdxs = this.colNames.map(cName => this._resolveCol(cName));
        for (const cIdx of colIdxs) {
          const col = this._cols[cIdx];
          const colName = this.colNames[cIdx];
          colNames.push(colName);
          newCols.push(f(col));
        }
        return new DF([colNames, newCols], 'cols', ['column', aggName]);
      },
    });
  }

  /**
   * @param {!String} aggName
   * @param {!Function} f
   * @private
   */
  _registerNumAgg(aggName, f) {
    Object.defineProperty(this, aggName, {
      get() {
        const colNames = [];
        const newCols = [];
        const colIdxs = this.colNames.map(cName => this._resolveCol(cName));
        for (const cIdx of colIdxs) {
          const col = this._cols[cIdx];
          const cName = this.colNames[cIdx];
          if (col.constructor.name !== 'Array') {
            colNames.push(cName);
            newCols.push(f(col));
          }
        }
        return new DF([colNames, newCols], 'cols', ['column', aggName]);
      },
    });
  }

  /**
   * @param {!String|!Number} colId
   * @returns {!Number} column index
   * @private
   */
  _resolveCol(colId) {
    // resolve named column
    if (colId.constructor.name === 'String') {
      return this.colNames.findIndex(colName => colName === colId);
    }

    // resolve negative idx
    if (colId < 0) {
      return this._resolveCol(this.nCols + colId);
    }

    // int idx
    return colId;
  }

  /**
   * @param {!String|!Number} colId
   * @returns {Array<String>|TypedArray} column
   */
  col(colId) {
    return this._cols[this._resolveCol(colId)];
  }

  /**
   * @param {!Number} idx
   * @returns {!Array<*>} row
   */
  row(idx) {
    return Array(this.nCols)
      .fill(0)
      .map((_, colIdx) => this.val(idx, colIdx));
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
   * @param {!DF} other
   * @returns {!DF} data frame
   */
  concat(other) {
    const cols = Array.from(this._cols);
    const colNames = Array.from(this.colNames);
    for (let c = 0; c < this.nCols; c++) {
      if (cols[c].constructor.name === 'Array') {
        cols[c] = cols[c].concat(other._cols[c]);
        continue;
      }
      const otherCol = other._cols[c];
      const thisCol = cols[c];
      const newArr = Series.empty(thisCol.length + otherCol.length);
      newArr.set(thisCol);
      newArr.set(otherCol, thisCol.length);
      cols[c] = newArr;
    }
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {!Number} n ratio or number of elements
   * @returns {!DF} data frame
   */
  sample(n = 0.1) {
    const rows = sampleWOR(Array(this.length).fill(0).map((_, idx) => idx), n).map(idx => this.row(idx));
    return new DF(rows, 'rows', this.colNames);
  }

  /**
   * @param {!Number|!String} colId
   * @param {!Function} f
   * @param {?Function} [f2]
   * @returns {!DF} data frame
   */
  mapCol(colId, f, f2 = Series.from) {
    if (this.nCols === 1) {
      return this.mapCol(0, f, f2);
    }
    const colIdx = this._resolveCol(colId);
    const cols = Array.from(this._cols);
    const mappedCol = cols[colIdx].map(f);
    cols[colIdx] = f2 ? f2(mappedCol) : mappedCol;
    return new DF(cols, 'cols', this.colNames);
  }

  /**
   * @param {!Array<!String>|!Array<!Number>|TypedArray} col
   * @param {?String} [name]
   * @returns {!DF} data frame
   */
  appendH(col, name = null) {
    const cols = Array.from(this._cols);
    const colNames = Array.from(this.colNames);
    cols.push(Series.from(col));
    colNames.push(name || cols.length - 1);
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {!DF} other other data frame
   * @returns {!DF} data frame
   */
  concat(other) {
    const isDigit = /^\d+$/; // check if has proper column names or just indexes
    let colNames;

    // if columns are indexes, shift them
    if (other.colNames.filter(c => c.toString().match(isDigit)).length === other.colNames.length) {
      colNames = this.colNames.concat(other.colNames.map(cIdx => this.colNames.length + cIdx));
    } else {
      colNames = this.colNames.concat(other.colNames);
    }

    const cols = this._cols.concat(other._cols);
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {!DF} other data frame
   * @returns {!DF} data frame
   */
  concatH(other) {
    const cols = Array(this.nCols).fill(0);
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const col = this._cols[cIdx];
      const otherCol = other._cols[cIdx];
      if (col.constructor.name === 'Array') {
        cols.push(col.concat(otherCol));
      } else {
        cols.push(concat(col, otherCol));
      }
    }
    return new DF(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {...<!Number|!String>} colIds
   * @return {!DF} data frame
   */
  select(...colIds) {
    const cols = [];
    const colNames = [];

    for (const i of new Set(colIds.map(id => this._resolveCol(id)))) {
      cols.push(this._cols[i]);
      colNames.push(this.colNames[i]);
    }

    return new DF(cols, 'cols', colNames);
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
   * @returns {{rows: !Number, cols: !Number}}
   */
  get dim() {
    return { rows: this.length, cols: this.nCols };
  }

  /**
   * @param {...!String} colIds
   * @returns {!Array<!String>|!String} data type for the column
   */
  dtype(...colIds) {
    if (colIds.length === 1) {
      const t = this._cols[this._resolveCol(colIds[0])].constructor.name;
      if (t === 'Array') {
        return 'Array';
      } else {
        // typed array
        return t.replace('Array', '');
      }
    } else if (colIds.length === 0) {
      return this.dtypes;
    } else {
      return colIds.map(c => this.dtype(c));
    }
  }

  /**
   * @returns {!Array<!String>} data types for all columns
   */
  get dtypes() {
    return this._cols.map((c) => {
      if (c.constructor.name === 'Array') {
        return 'String';
      } else {
        return c.constructor.name.replace('Array', '');
      }
    });
  }

  /**
   * @returns {{total: !Number, cols: Object<!Number>}} memory info
   */
  get memory() {
    const memInfo = { total: 0, cols: {} };
    for (const colName of this.colNames) {
      const col = this.col(colName);
      if (col.constructor.name === 'Array') {
        memInfo.cols[colName] = sum(col.map(s => s.length));
      } else {
        memInfo.cols[colName] = col.byteLength;
      }
      memInfo.total += memInfo.cols[colName];
    }
    return memInfo;
  }

  /**
   * @param {?Number} [n]
   * @returns {!DF} data frame
   */
  head(n = 10) {
    return this.slice(0, n);
  }

  /**
   * @param {?Number} [n]
   * @returns {!DF} data frame
   */
  get tail(n = 10) {
    return this.slice(this.length - n, this.length);
  }

  /**
   * @returns {!DF} reversed version of the data frame
   */
  get reversed() {
    // reverse rows
    const cols = [];
    for (let c = 0; c < this.nCols; c++) {
      const col = this._cols[c];
      cols.push(clone(col).reverse());
    }
    return new DF(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {...<!String|!Number>} cols col pairs
   * @returns {!DF} data frame
   */
  sliceH(...cols) {
    if (cols.length === 0) {
      throw new Error('no slice idxs specified (HINT: try .sliceH(0, -1))');
    } else if (cols.length % 2 !== 0) {
      cols.push(this.nCols); // odd number of idxs
      /*
       * e.g. sliceH(0)         -> sliceH(0, end)
       * e.g. sliceH(0, 10, 20) -> sliceH(0, 10, 20, end)
       */
    }

    // collect column idxs
    const colIds = new Set();

    for (let i = 1; i < cols.length; i += 2) {
      const lBound = this._resolveCol(cols[i - 1]);
      const rBound = this._resolveCol(cols[i]);
      for (let colIdx = lBound; colIdx < rBound; colIdx++) {
        colIds.add(colIdx);
      }
    }

    // then select them
    return this.select(...colIds);
  }

  /**
   * @param {...!Number} idxs PAIRS of indexes
   * @returns {!DF} a data frame
   */
  slice(...idxs) {
    if (idxs.length === 0) {
      throw new Error('no slice idxs specified (HINT: try .slice(0, 10))');
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
      for (let colIdx = 0; colIdx < this.nCols; colIdx++) {
        const col = this._cols[colIdx];
        // deep-copy in arrays
        if (col.constructor.name === 'Array') {
          cols[colIdx] = col.slice(lBound, rBound);
        // shallow-copy in typed arrays
        } else {
          cols[colIdx] = col.subarray(lBound, rBound);
        }
      }
    }

    return new DF(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!Number|!String} colId
   * @param {'asc'|'desc'} ord
   * @returns {DF}
   */
  orderBy(colId, ord = 'asc') {
    const colIdx = this._resolveCol(colId);
    let rows;
    if (ord.match(/^\s*asc/i)) {
      rows = Array
        .from(this.rowIter)
        .sort((r1, r2) => {
          if (r1[colIdx] > r2[colIdx]) return 1;
          if (r1[colIdx] < r2[colIdx]) return -1;
          return 0;
        });
    } else {
      rows = Array
        .from(this.rowIter)
        .sort((r1, r2) => {
          if (r1[colIdx] < r2[colIdx]) return 1;
          if (r1[colIdx] > r2[colIdx]) return -1;
          return 0;
        });
    }
    return new DF(rows, 'rows', this.colNames);
  }

  /**
   * @param {...<!String|!Number>} colIds
   * @return {!DF} data frame
   */
  drop(...colIds) {
    const toDelete = colIds.map(id => this._resolveCol(id));
    const cols = [];
    const colNames = [];
    const neededCols = this.colNames
      .map((_, idx) => idx)
      .filter(colIdx => toDelete.indexOf(colIdx) < 0);
    for (const cIdx of neededCols) {
      cols.push(this._cols[cIdx]);
      colNames.push(this.colNames[cIdx]);
    }
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {...<!Number|!String>} [params]
   */
  kBins(...params) {
    if (params.length === 0) {
      // default to 6 bins
      params = [6];
    }
    if (params.length === 1) {
      /*
       * if 1 param assume it's the bin size
       * and k-bin all columns
       */
      const k = params[0];
      params = this.colNames.map((_, idx) => [idx, k])
        .reduce((a1, a2) => a1.concat(a2), []);
    }
    const cols = Array.from(this._cols);
    for (let i = 1; i < params.length; i += 2) {
      const colId = params[i - 1];
      const k = params[i];
      const col = cols[this._resolveCol(colId)];
      const colSorted = Array.from(col)
        .sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
      const binSize = Math.floor(col.length / k);
      const bitsPerVal = Math.ceil(Math.log2(k));
      const newArr = Series.empty(
        bitsPerVal <= 8 ? 'u8' : bitsPerVal <= 16 ? 'u16' : 'u32', col.length,
      );
      const bounds = Series.empty('f64', k);

      // determine boundaries
      for (let rowIdx = binSize; rowIdx < col.length; rowIdx += binSize) {
        bounds[rowIdx / binSize] = colSorted[rowIdx];
      }

      // last bin captures all
      bounds[bounds.length - 1] = Infinity;

      log.debug(`bounds: [${bounds.join(', ')}]`);

      for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
        const val = col[rowIdx];
        for (let b = 0; b < bounds.length; b++) {
          if (val <= bounds[b]) {
            newArr[rowIdx] = b;
            break;
          }
        }
      }
      cols[this._resolveCol(colId)] = newArr;
    }

    return new DF(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!Function} f predicate (row => Boolean)
   * @returns {!DF} data frame
   */
  filter(f = (_row, _idx) => true) {
    return new DF(Array.from(this.rowIter).filter(f), 'rows', Array.from(this.colNames));
  }

  /**
   * Shuffle the data frame.
   *
   * @returns {!DF} data frame with shuffle rows
   */
  shuffle() {
    const rows = Array.from(this.rowIter);
    shuffle(rows);
    return new DF(rows, 'rows', this.colNames);
  }

  /**
   * @param {!String|!Number} colId
   * @param {!Function} [f]
   * @param {!String} [colName]
   * @returns {!DF} data frame
   */
  groupBy(colId, f = xs => mean(xs), colName = 'AggregateFunction') {
    const colIdx = this._resolveCol(colId);
    const index = {};
    for (const r of this.rowIter) {
      const val = r[colIdx];
      const row = r.slice(0, colIdx)
        .concat(r.slice(colIdx + 1));
      if (index[val] === undefined) {
        index[val] = [row];
      } else {
        index[val].push(row);
      }
    }
    for (const k of Object.keys(index)) {
      index[k] = f(index[k]);
    }
    return new DF(Object.entries(index), 'rows', [this.colNames[colIdx], colName]);
  }

  /**
   * Produce a count table for values of a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DF} data frame of counts
   */
  count(colId) {
    const colIdx = this._resolveCol(colId);
    return new DF(
      bag(this._cols[colIdx]).entries(),
      'rows',
      [this.colNames[colIdx], 'count'],
    );
  }

  /**
   * @returns {!Array<!Number>}
   * @private
   */
  get _numCols() {
    return Array(this.nCols).fill(0).map((_, idx) => idx).filter(cIdx => this._cols[cIdx].constructor.name !== 'Array');
  }

  /**
   * @returns {!Array<!Number>}
   * @private
   */
  get _strCols() {
    return Array(this.nCols).fill(0).map((_, idx) => idx).filter(cIdx => this._cols[cIdx].constructor.name === 'Array');
  }

  /**
   * @param {...<!String|!Number>} [colIds]
   * @return {!DF} normalized data frame
   */
  normalize(...colIds) {
    if (colIds.length === 0) {
      // by default normalize all
      return this.normalize(...this.colNames);
    }
    const numCols = new Set(this._numCols);
    const cols = [];
    const colNames = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      colNames.push(this.colNames[cIdx]);
      const col = this._cols[cIdx];
      if (numCols.has(cIdx)) {
        cols.push(normalize(col));
      } else {
        cols.push(col);
      }
    }
    return new DF(cols, 'cols', colNames);
  }

  /**
   * Encode string data into integer labels.
   *
   * @param {...<!String|!Number>} colIds
   * @return {!DF} data frame
   */
  labelEncode(...colIds) {
    if (colIds.length === 0 && this.nCols === 1) {
      colIds = [0];
    }
    const cols = Array.from(this._cols);
    for (const colIdx of colIds.map(id => this._resolveCol(id))) {
      const col = this._cols[colIdx];
      const uniqueVals = new Set(col);
      const bitsNeeded = Math.max(8, Math.ceil(Math.log2(uniqueVals.size)));
      const newArr = Series.empty(
        bitsNeeded <= 8 ? 'u8' : bitsNeeded <= 16 ? 'u16' : 'u32', col.length,
      );
      const map = new Map();
      let i = 0;
      for (const val of uniqueVals) {
        map.set(val, i);
        i++;
      }
      for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
        const val = col[rowIdx];
        newArr[rowIdx] = map.get(val);
      }
      cols[colIdx] = newArr;
    }
    return new DF(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * One hot encode a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DF} one hot encoded table
   */
  oneHot(colId = null) {
    if (colId === null && this.nCols === 1) {
      return this.oneHot(0);
    }
    const col = this.col(colId);
    const k = max(col) + 1;
    const cols = Array(k)
      .fill(0)
      .map(_ => Series.empty(col.length, 'u8'));
    for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
      const val = col[rowIdx];
      cols[val][rowIdx] = 1;
    }
    return new DF(cols, 'cols');
  }

  /**
   * Summaries each column.
   *
   * @returns {DF} data frame
   */
  summary() {
    const info = {
      column: [],
      dtype: [],
      min: Series.empty(this.nCols),
      max: Series.empty(this.nCols),
      range: Series.empty(this.nCols),
      mean: Series.empty(this.nCols),
      stdev: Series.empty(this.nCols),
    };
    for (let c = 0; c < this.nCols; c++) {
      const dtype = this.dtypes[c];
      const name = this.colNames[c];
      if (dtype === 'String') {
        info.column.push(name);
        info.dtype.push(dtype);
        for (const k in [
          'min',
          'max',
          'range',
          'mean',
          'stdev',
        ]) {
          info[k][c] = NaN;
        }
        continue;
      }
      const col = this._cols[c];
      info.column.push(name);
      info.dtype.push(dtype);
      info.min[c] = min(col);
      info.max[c] = max(col);
      info.range[c] = info.max[c] - info.min[c];
      info.mean[c] = mean(col);
      info.stdev[c] = stdev(col);
    }
    return new DF(info);
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
      ? Array.from(this.rowIter)
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
      return this.print(Series.from([25, process.stdout.rows - 1, this.length]).min());
    } else if (m === null) {
      return this.print(0, n);
    } else if (m > this.length) {
      return this.print(n, this.length);
    }
    const table = [];
    for (let rowIdx = n; rowIdx < m; rowIdx++) {
      const namedRow = {};
      for (let colIdx = 0; colIdx < this.nCols; colIdx++) {
        const colName = this.colNames[colIdx];
        namedRow[colName] = this.val(rowIdx, colIdx);
      }
      table.push(namedRow);
    }
    console.table(table);
  }

  /**
   * @returns {!DF} shallow copy of the data frame
   */
  copy() {
    return new DF(Array.from(this._cols), 'cols', Array.from(this.colNames));
  }

  /**
   * @returns {!DF} clone (deep copy) of the data frame
   */
  clone() {
    const newCols = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const col = this._cols[cIdx];
      newCols.push(clone(col));
    }
    return new DF(newCols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!String} filePath
   * @param {?Boolean} [hasHeader]
   * @param {?Array<!String>} colNames
   * @returns {!DF} data frame
   */
  static fromCSV(filePath, hasHeader = true, colNames = null) {
    if (!filePath.match(/\.csv/i)) {
      log.warn('not a *.csv file');
    }
    const rows = readCSV(filePath, false); // assume for now it doesn't
    if (hasHeader) {
      const header = rows[0];
      return new DF(rows.splice(1), 'rows', header);
    } else {
      return new DF(rows.splice(1), 'rows');
    }
  }

  /**
   * @param {!String} filePath
   * @returns {!DF} data frame
   */
  static fromFile(filePath) {
    if (!existsSync(filePath) && existsSync(`${filePath}.df`)) {
      return DF.fromFile(`${filePath}.df`);
    }
    const json = JSON.parse(gunzipSync(readFileSync(filePath)).toString('utf-8'));
    const colNames = Object.keys(json);
    const isIndexed = colNames.map(nm => !!nm.match(/^\d+$/)).reduce((l, r) => l && r, true);
    return new DF(
      Object.values(json),
      'cols',
      isIndexed ? colNames.map(parseFloat) : colNames,
    );
  }

  /**
   * @param {!String} name
   * @param {?Boolean} hasHeader
   * @param {?Array<!String>} colNames
   * @returns {!DF} data frame
   */
  static loadDataSet(name, hasHeader = true, colNames = null) {
    return DF.fromCSV(`${dirname(__filename)}/datasets/${name}/${name}.csv`, hasHeader, colNames);
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
    return readdirSync(DF.dataSetsPath).filter(node => !node.match(/\.w+$/));
  }

  /**
   * @returns {!String} string representation of the data frame
   */
  toString() {
    return `${this.constructor.name} ${this.nCols}x${this.length} { ${this.dtypes.map((dt, idx) => `${this.colNames[idx]}  ${dt}`).join(', ')} }`;
  }
}

module.exports = DF;
