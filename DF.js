const { dirname, join } = require('path');
const { gunzipSync, gzipSync } = require('zlib');
const { mkdirSync, readdirSync, existsSync, writeFileSync, readFileSync } = require('fs');

// noinspection JSUnusedLocalSymbols
const { arange, toTypedArray, transpose: t, shuffle, getTypedArray, normalize, mad, max, mean, range, median, min, mode, nQuart, stdev, variance, sum, product } = require('./utils');
const { readCSV } = require('./utils/load');
const log = require('./utils/log');
const { sampleWOR } = require('./utils');


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
     * - list of rows <Array<Array<*>>,
     * - Object<*, Array<*>> (dict key => col)
     * - a DF (just clone it)
     */
    if (data.length === 0) {
      this._cols = [];
      this.colNames = [];
    } else if (data.constructor.name === this.constructor.name) {
      this._cols = Array.from(data._cols);
      this.colNames = Array.from(data.colNames);
    } else if (data.constructor.name === 'Object' || what === 'dict') {
      this._cols = Object.values(data)
        .map(c => toTypedArray(c));
      this.colNames = Object.keys(data);
    } else {
      this._cols = what === 'rows' ? t(data)
        .map(c => toTypedArray(c)) : data.map(c => toTypedArray(c));
      this.colNames = colNames || Array(this.nCols)
        .fill(0)
        .map((_, idx) => idx);
    }

    const attrNames = new Set(this.colNames);
    // index using cols integers AND column names
    Array(this.nCols)
      .fill(0)
      .map((_, idx) => attrNames.add(idx));

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

    for (const o of [
      'mean',
      'median',
      'variance',
      'stdev',
      'mad',
      'range',
      'sum',
      'product',
      'min',
      'max',
    ]
      .filter(agg => this[agg] === undefined)
      .map(agg => ({ aggName: agg, f: eval(agg) }))) {
      this._registerNumAgg(o.aggName, o.f);
    }
    if (this.mode === undefined) {
      this._registerAgg('mode', eval('mode'));
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
        const names = [];
        const results = [];
        for (const cIdx of this.colNames.map(cName => this._resolveCol(cName))) {
          const col = this._cols[cIdx];
          const colName = this.colNames[cIdx];
          names.push(colName);
          results.push(f(col));
        }
        return new DF([names, results], 'cols', ['column', aggName]);
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
        const names = [];
        const results = [];
        for (const cIdx of this.colNames.map(cName => this._resolveCol(cName))) {
          const col = this._cols[cIdx];
          const colName = this.colNames[cIdx];
          if (col.constructor.name !== 'Array') {
            names.push(colName);
            results.push(f(col));
          }
        }
        return new DF([names, results], 'cols', ['column', aggName]);
      },
    });
  }

  /**
   * @param {!String|!Number} colId
   * @returns {!Number} column index
   * @private
   */
  _resolveCol(colId) {
    if (colId.constructor.name === 'String') {
      return this.colNames.findIndex(c => c === colId);
    } else if (colId < 0) {
      return this._resolveCol(this.nCols + colId);
    } else {
      return colId;
    }
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
      .map((_, colIdx) => this.val(colIdx, idx));
  }

  /**
   * @returns {!Number|!String} selects a val
   */
  val(col, idx) {
    return this.col(col)[idx];
  }

  /**
   * @param {!DF} other
   * @returns {!DF} data frame
   */
  concat(other) {
    const cols = Array.from(this._cols);
    const colNames = Array.from(this.colNames);
    for (let c = 0; c < cols.length; c++) {
      if (cols[c].constructor.name === 'Array') {
        cols[c] = cols[c].concat(other.col(c));
        continue;
      }
      const otherCol = other._cols[c];
      const thisCol = cols[c];
      const newLen = thisCol.length + otherCol.length;
      let dtype;
      if (otherCol.BYTES_PER_ELEMENT >= thisCol.BYTES_PER_ELEMENT) {
        dtype = otherCol.constructor.name.replace('Array', '');
      } else {
        dtype = thisCol.constructor.name.replace('Array', '');
      }
      const newArr = getTypedArray(dtype, newLen);
      newArr.set(thisCol);
      newArr.set(otherCol, thisCol.length);
      cols[c] = newArr;
    }
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {!Number} n
   * @returns {!DF} data frame
   */
  sample(n = 0.1) {
    return new DF(
      sampleWOR(Array(this.length)
        .fill(0)
        .map((_, idx) => idx), Math.floor(this.length * n))
        .map(idx => this.row(idx)),
      'rows',
      this.colNames,
    );
  }

  /**
   * @param {!Number|!String} colId
   * @param {!Function} f
   * @param {?Function} [f2]
   * @returns {!DF} data frame
   */
  mapCol(colId, f, f2 = toTypedArray) {
    const colIdx = this._resolveCol(colId);
    const cols = Array.from(this._cols);
    cols[colIdx] = f2 ? f2(cols[colIdx].map(f)) : cols[colIdx].map(f);
    return new DF(cols, 'cols', this.colNames);
  }

  /**
   * @param {!Array<!String>|!Array<!Number>} col
   * @param {?String} [name]
   * @returns {!DF} data frame
   */
  appendCol(col, name = null) {
    const cols = Array.from(this._cols);
    const colNames = Array.from(this.colNames);
    cols.push(toTypedArray(col));
    colNames.push(name || cols.length - 1);
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {!DF} other other data frame
   * @returns {!DF} data frame
   */
  mergeDF(other) {
    const isDigit = /^\d+$/; // check if has proper column names or just indexes
    let colNames;

    // if columns are indexes, shift them
    if (other.colNames.filter(c => c.toString()
      .match(isDigit)).length === other.colNames.length) {
      colNames = this.colNames.concat(other.colNames.map(cIdx => this.colNames.length + cIdx));
    } else {
      colNames = this.colNames.concat(other.colNames);
    }

    const cols = this._cols.concat(other._cols);
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {...<!Number|!String>} colIds
   * @return {!DF} data frame
   */
  select(...colIds) {
    const cols = [];
    const colNames = [];
    for (const i of Array.from(new Set(colIds))
      .map(c => this._resolveCol(c))) {
      cols.push(this._cols[i]);
      colNames.push(this.colNames[i]);
    }
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @returns {!Number} number of rows
   */
  get length() {
    return this._cols[0] !== undefined && this._cols[0].length;
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
    return this._cols.map(c => (c.constructor.name === 'Array'
      ? 'String'
      : c.constructor.name.replace('Array', '')));
  }

  /**
   * @returns {{total: !Number, cols: Object<!Number>}} memory info
   */
  get memory() {
    const memInfo = {
      total: this._cols
        .map(c => (c.constructor.name === 'Array'
          ? mean(c.map(s => s.length)) // assume 1 byte / char for string cols
          : c.byteLength))
        .reduce((v1, v2) => v1 + v2, 0), // sum
      cols: {},
    };
    for (const colName of this.colNames) {
      const colIdx = this._resolveCol(colName);
      if (this._cols[colIdx].constructor.name === 'Array') {
        memInfo.cols[colName] = this._cols[colIdx].map(s => s.length)
          .reduce((left, right) => left + right, 0);
      } else {
        memInfo.cols[colName] = this._cols[colIdx].byteLength;
      }
    }
    return memInfo;
  }

  /**
   * @returns {!DF} data frame
   */
  get head() {
    return this.slice(0, 10);
  }

  /**
   * @returns {!DF} data frame
   */
  get tail() {
    return this.slice(this.length - 10, this.length);
  }

  /**
   * @returns {!DF} reversed version of the data frame
   */
  reversed(axis = 'cols') {
    if (axis === 'cols') {
      const cols = Array.from(this._cols)
        .reverse();
      const colNames = Array.from(this.colNames)
        .reverse();
      return new DF(cols, 'cols', colNames);
    }
    // reverse rows
    const cols = [];
    for (let c = 0; c < this.nCols; c++) {
      cols.push(Array.from(this._cols[c])
        .reverse());
    }
    const colNames = Array.from(this.colNames);
    return new DF(cols, 'cols', colNames);
  }

  /**
   * @param {...<!String|!Number>} cols col pairs
   */
  sliceCols(...cols) {
    if (cols.length === 0) {
      return this;
    } else if (cols.length % 2 !== 0) {
      cols.push(this.nCols);
    }

    const colIds = new Set();

    for (let i = 1; i < cols.length; i += 2) {
      const min = this._resolveCol(cols[i - 1]);
      const max = this._resolveCol(cols[i]);
      for (let c = min; c < max; c++) {
        colIds.add(c);
      }
    }

    return this.select(...colIds);
  }

  /**
   * @param {...!Number} idxs pairs of indexes
   * @returns {!DF} a data frame
   */
  slice(...idxs) {
    if (idxs.length === 0) {
      return this;
    } else if (idxs.length === 1) {
      return this.slice(idxs[0], this.length);
    } else if (idxs.length % 2 !== 0) {
      idxs.push(this.length);
    }

    const cols = Array(this.nCols).fill(0).map(_ => []);

    // for every pair of indexes
    for (let i = 1; i < idxs.length; i += 2) {
      const lBound = idxs[i - 1];
      const rBound = idxs[i];
      for (let colIdx = 0; colIdx < this.nCols; colIdx++) {
        cols[colIdx] = this._cols[colIdx].slice(lBound, rBound);
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
      rows = Array.from(this.rowIter)
        .sort((r1, r2) => {
          if (r1[colIdx] > r2[colIdx]) return 1;
          if (r1[colIdx] < r2[colIdx]) return -1;
          return 0;
        });
    } else {
      rows = Array.from(this.rowIter)
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
      const newArr = getTypedArray(
        bitsPerVal <= 8 ? 'Uint8' : bitsPerVal <= 16 ? 'Uint16' : 'Uint32', col.length,
      );
      const bounds = getTypedArray('Float64', k);

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
   * @returns {!DF} data frame with shuffled rows
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
      Object.entries(bag(this._cols[colIdx])),
      'rows',
      [this.colNames[colIdx], 'count'],
    );
  }

  /**
   * @returns {!TypedArray}
   * @private
   */
  get _numCols() {
    return toTypedArray(arange(this.nCols).filter(cIdx => this._cols[cIdx].constructor.name !== 'Array'));
  }

  /**
   * @returns {!TypedArray}
   * @private
   */
  get _strCols() {
    return arange(this.nCols).filter(cIdx => this._cols[cIdx].constructor.name === 'Array');
  }

  /**
   * @param {...<!String|!Number>} colIds
   * @return {!DF} data frame
   */
  normalize(...colIds) {
    if (colIds.length === 0) {
      return this.normalize(...this.colNames);
    }
    const allStrCols = this._strCols;
    const colIdxs = new Set(colIds.map(c => this._resolveCol(c)).filter(cIdx => allStrCols.indexOf(cIdx) < 0));
    const cols = [];
    const colNames = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      if (colIdxs.has(cIdx)) {
        cols.push(this._cols[cIdx].normalized);
      } else {
        cols.push(this._cols[cIdx]);
      }
      colNames.push(this.colNames[cIdx]);
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
      const newArr = getTypedArray(
        bitsNeeded <= 8 ? 'Uint8' : bitsNeeded <= 16 ? 'Uint16' : 'Uint32', col.length,
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
  oneHot(colId) {
    if (colId === undefined && this.nCols === 1) {
      colId = 0;
    }
    const col = this.col(colId);
    const k = col.reduce((v1, v2) => Math.max(v1, v2)) + 1;
    const cols = Array(k)
      .fill(0)
      .map(_ => getTypedArray('Uint8', col.length));
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
  get summary() {
    const info = {
      column: [],
      min: [],
      max: [],
      range: [],
      mean: [],
      stdev: [],
      dtype: [],
    };
    for (let c = 0; c < this.nCols; c++) {
      const dtype = this.dtypes[c];
      const name = this.colNames[c];
      if (dtype === 'String') {
        for (const k in info) info[k].push('NaN');
        info.column[info.column.length - 1] = name;
        info.dtype[info.dtype.length - 1] = dtype;
        continue;
      }
      const col = this._cols[c];
      const min = col.reduce((v1, v2) => Math.min(v1, v2));
      const max = col.reduce((v1, v2) => Math.max(v1, v2));
      info.column.push(name);
      info.mean.push(mean(col));
      info.dtype.push(dtype);
      info.stdev.push(Math.sqrt(variance(col)));
      info.min.push(min);
      info.max.push(max);
      info.range.push(max - min);
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
   * @returns {!Promise<*>}
   */
  toFile(fileName) {
    if (!fileName.endsWith('.df')) {
      log.warn('not a "*.df" file name');
    }
    const parent = dirname(fileName);
    if (!existsSync(parent)) {
      mkdirSync(parent);
    }
    return writeFileSync(fileName, gzipSync(this.toJSON()), { flag: 'w' });
  }

  /**
   * @param {?Number} [n]
   * @param {?Number} [m]
   */
  print(n = null, m = null) {
    if (n === null) {
      const lens = [25, process.stdout.rows - 1, this.length];
      const l = lens.reduce((v1, v2) => Math.min(v1, v2));
      return this.print(l);
    } else if (m === null) return this.print(0, n);
    const rows = [];
    for (let rowIdx = n; rowIdx < m; rowIdx++) {
      const r = [];
      for (let colIdx = 0; colIdx < this.nCols; colIdx++) {
        r.push(this.val(colIdx, rowIdx));
      }
      rows.push(r);
    }
    const table = rows.map((row) => {
      const dict = {};
      for (let v = 0; v < row.length; v++) {
        const colName = this.colNames[v];
        dict[colName] = row[v];
      }
      return dict;
    });
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
      if (col.constructor.name === 'Array') {
        newCols.push(Array.from(col));
      } else {
        const newTypedArr = getTypedArray(col.constructor.name.replace('Array', ''), col.length);
        newTypedArr.set(col);
        newCols.push(newTypedArr);
      }
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
   * @returns {!DF}
   */
  static fromFile(filePath) {
    if (!existsSync(filePath) && existsSync(`${filePath}.df`)) {
      return DF.fromFile(`${filePath}.df`);
    }
    const json = JSON.parse(gunzipSync(readFileSync(filePath))
      .toString('utf-8'));
    const colNames = Object.keys(json);
    const isIndexed = colNames.map(nm => !!nm.match(/^\d+$/))
      .reduce((l, r) => l && r, true);
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
  static loadDataSet(name = 'iris', hasHeader = true, colNames = null) {
    return DF.fromCSV(`${dirname(__filename)}/datasets/${name}/${name}.csv`, hasHeader, colNames);
  }

  /**
   * @returns {!String}
   */
  static get dataSetsPath() {
    return join(dirname(__filename), 'datasets');
  }

  /**
   * @returns {!Array<!String>} datasets
   */
  static get dataSets() {
    return readdirSync(DF.dataSetsPath)
      .filter(node => !node.match(/\.w+$/));
  }

  toString() {
    return `${this.constructor.name} ${this.nCols}x${this.length} { ${this.dtypes.map(
      (dt, idx) => `${this.colNames[idx]}  ${dt}`,
    )
      .join(', ')} }`;
  }
}

module.exports = DF;
