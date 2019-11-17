// vim:hlsearch:nu:foldmethod=manual:sw=2:ts=4:expandtab:
/**
 * TODO loading (g)zipped csv
 * TODO concat is broken
 * TODO mixed types of colNames don't work
 * TODO finish typing Column.js & DataFrame.js
 * TODO string col hashing
 * TODO edit photos, link to in README
 * TODO document cum ops
 * TODO replace is broken
 * TODO binarizer
 * TODO document imports
 * TODO document matrix ops
 * TODO document add, mul, div, sub
 * TODO document opts, printing presets
 * TODO document dataset lookup
 * TODO re-think the dataset lookup API
 * TODO document examples of matrix ops, aggs, functs
 * TODO calculate the *base* size of each column (pointers are 8B)
 */
const util = require('util');
const { join, resolve, dirname } = require('path');
const {
  readdirSync,
  readFileSync,
  createWriteStream,
  existsSync,
  statSync
} = require('fs');

const request = require('sync-request');
const parseCSV = require('csv-parse/lib/sync');
const stringifyCSV = require('csv-stringify');

const Column = require('./Column');
const { randInt } = require('./rand');
const {
  fmtFloat,
  unify,
  fmtFloatSI,
  dtypeRegex,
  isNumber,
  isString,
  isURL,
  isMap,
  isSameType,
  isFile,
  isObject,
  isFunction,
  transpose
} = require('./utils');
const log = require('./log');
const opts = require('./opts');

const {
  PROGRAMMER_PRINTING,
  DEFAULT_PRINTING,
  MINIMAL_PRINTING
} = require('./presets');


class DataFrame {
  /**
   * @param {!DataFrame|!Object<!String|!Number,!Number|!String|!Array<!String>|!Array<!Number>|!ColStr|!ColNum|!TypedArray>|!Array<!Array<!Number|!String>>|!Array<!TypedArray|!Array<!Number>|!Array<!String>|!ColStr|!ColNum>|!Map<String,!Number|!String|!Array<!Number>|!Array<!String>>} data
   * @param {!String} [what]
   * @param {?Array<!String>|?ColStr} [colNames] labels for every column (#cols === #labels)
   * @param {!Array<!String>|!ColStr|null} [dtypes]
   */
  constructor(data = [], what = '', colNames = null, dtypes = null) {
    if (what.toLowerCase() !== what) {
      log.debug(`lowercasing ${what}`);
      return new DataFrame(data, what.toLowerCase(), colNames, dtypes);

    // another data frame, shallow copy it
    } else if (what === 'df') {
      log.info(`input is another ${this.constructor.name}, making a shallow copy`);
      return new DataFrame(
        [...data.cols],
        'cols',
        [...data.colNames],
        data.dtypes,
      );

    } else if (isSameType(this, data)) {
      log.info(`detected ${this.constructor.name}`);
      return new DataFrame(data, 'df', colNames, dtypes);

    } else if (isString(data)) {

      if (what.startsWith('url')) {
        log.info(`GET ${data}`);
        let newWhat;
        if (what === 'url') {
          newWhat = data.search(/\.json$/i) >= 0 ? 'json' : 'csv';
        } else {
          newWhat = what.replace(/^url/, '');
        }
        const s = request('GET', data).getBody().toString('utf-8');
        return new DataFrame(s, newWhat, colNames, dtypes);

      } else if (isURL(data)) {
        log.info(`detected URL`);
        return new DataFrame(data, `url${what}`, colNames, dtypes);

      } else if (what.startsWith('json')) {
        log.info('input is JSON String, parsing');
        if (what === 'json') {
          log.info('assuming input is JSON object');
          return new DataFrame(JSON.parse(data), 'obj', colNames, dtypes);
        } else {
          const hint = what.replace(/^json/, '');
          log.info(`using further hint "${hint}"`);
          return new DataFrame(JSON.parse(data), hint, colNames, dtypes);
        }

      } else if (what.startsWith('csv')) {
        log.info('input is CSV String, parsing');
        const rows = parseCSV(data, { skip_empty_lines: true, trim: true });
        if (colNames === null) {
          log.warn(`column names not provided, assuming first row is column names`);
          const header = rows.splice(0, 1)[0];
          return new DataFrame(rows, 'rows', header, dtypes);
        } else {
          log.debug('using provided column names');
          return new DataFrame(rows, 'rows', colNames, dtypes);
        }

      } else if (what.startsWith('file')) {
        log.info(`input is file "${data}"`);
        if (what === 'file') {
          const ext = (/\.([^.]+)$/i.exec(data) || [null, 'csv'])[1];
          log.info(`using extension .${ext} as hint`);
          return new DataFrame(readFileSync(data).toString('utf-8'), ext, colNames, dtypes);
        } else {
          log.info('using provided hint for file content type');
          return new DataFrame(readFileSync(data).toString('utf-8'), what.replace(/^file/i, ''), colNames, dtypes);
        }

      } else if (existsSync(data)) {
        log.info(`detected file`);
        return new DataFrame(data, 'file', colNames, dtypes);

        // dataset name with *.csv ending (walk recursively)
      } else if (data.search(/\.(csv|json)$/i) >= 0) {
        log.info(`input is dataset file name "${data}"`);
        const nodeStack = Array.from(opts.DATASETS);
        let i = 0;
        while (i < nodeStack.length) {
          const path = nodeStack[i];
          const stats = statSync(path);
          if (stats.isDirectory()) {
            for (const f of readdirSync(path)) {
              nodeStack.push(join(path, f));
            }
          } else if (stats.isFile() && path.endsWith(data)) {
            log.debug(`located dataset in ${path}`);
            return new DataFrame(path, 'file', colNames, dtypes);
          }
          i++;
        }

        // dataset name WITHOUT *.csv ending
      } else {
        log.info(`input is dataset name ${data} (no extension)`);
        const nodeStack = Array.from(opts.DATASETS);
        let i = 0;
        while (i < nodeStack.length) {
          const path = nodeStack[i];
          const stats = statSync(path);
          if (stats.isDirectory()) {
            for (const f of readdirSync(path)) {
              nodeStack.push(join(path, f));
            }
          } else if (stats.isFile()) {
            log.debug(`located dataset "${path}"`);
            return new DataFrame(path, 'file', colNames, dtypes);
          }
          i++;
        }
      }

      const lookedIn = opts.DATASETS.concat([dirname(data)]).map(p => resolve(p)).join(', ');
      throw new Error(`failed to find file, looked for a dataset in ${lookedIn} (you might want to push your dir to opts.DATASETS OR set 'what', see API)`);

      // javascript Object (PARSED)
    } else if (what.startsWith('obj')) {
      log.info('received Object');

      // if { String: Number | String }
      for (const key in data) {
        const val = data[key];
        if (isNumber(val) || isString(val)) {
          log.info('treating keys as column 1 and values as column 2');
          return new DataFrame(
            [Object.keys(data), Object.values(data)],
            'cols',
            colNames === null ? ['Key', 'Value'] : colNames,
            dtypes,
          );
        }
      }

      // else
      log.info('treating keys as column names and values as columns');
      return new DataFrame(
        Object.values(data),
        'cols',
        Object.keys(data),
        dtypes,
      );

    } else if (isObject(data)) {
      log.info('detected Object');
      return new DataFrame(data, `obj${what}`, colNames, dtypes);

      // map { col1 => col2, ... }
    } else if (what.startsWith('map')) {

      log.info('input is Map');

      // reverse logic to Object (above)

      for (const v of data.values()) {
        if (!isString(v) && !isNumber(v)) {
          log.info('using keys as column names and values as columns');
          return new DataFrame(
            [...data.values()],
            'cols',
            [...data.keys()],
            dtypes,
          );
        }
      }

      log.info('using keys as column 1 and values as column 2');
      const keys = [...data.keys()];
      const values = [...data.values()];
      return new DataFrame(
        [keys, values],
        'cols',
        colNames === null ? ['Key', 'Value'] : colNames,
        dtypes,
      );

    } else if (isMap(data)) {
      log.info('detected Map');
      return new DataFrame(data, `map${what}`, colNames, dtypes);

      // array of rows
    } else if (what.startsWith('rows')) {
      log.info('input is Array of rows, transposing to columns');
      return new DataFrame(transpose(data), 'cols', colNames, dtypes);

      // array of cols
    } else if (what.startsWith('cols')) {
      log.debug(`input is Array of ${data.length} columns`);
      this.cols = data.map((c, cIdx) => {
        let printName = `col #${cIdx}`;
        if (colNames !== null && colNames[cIdx] !== undefined) {
          printName += `  (${colNames[cIdx]})`;
        }
        log.debug(`${printName} is already a Column`);
        const isCol = Column.isCol(c);
        const dtypeGiven = dtypes !== null && dtypes[cIdx] !== null && dtypes[cIdx] !== undefined;
        const noNeedToConvert = isCol && (!dtypeGiven || c.dtype === dtypes[cIdx]);
        if (noNeedToConvert) {
          log.debug(`no need to convert ${printName}`);
          return c;
        }
        log.debug(`converting col ${printName}`);
        // else
        return Column.from(c, (dtypes !== null && dtypes[cIdx]) || null);
      });

      if (colNames === null) {
        this.colNames = Column.range(this.nCols);
      } else {
        this.colNames = Column.from(colNames.map(cName => cName.toString()), 's');
        log.debug(`used provided column names: [${this.colNames.join(', ')}]`);
      }

    } else if (what === '') {
      return new DataFrame(data, 'cols', colNames, dtypes);

    } else throw new Error('unrecognised input data');

    const attrNames = new Set(this.colNames);

    // index using cols integers AND column names
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      attrNames.add(cIdx);
    }

    /* easy access e.g. df.age, df.salary
     * easy replacement (assignment) of cols e.g. df.age = df2.age;
     * easy broadcasting e.g. df.label = 0; */
    for (const name of attrNames) {
      this._registerCol(name);
    }

    // functs and aggs are forwarded to the underlying column

    /* each aggregare op is a function (Column => Number)
     * it changes the shape of the data frame from n x m => m x 2 */
    for (const agg of opts.AGG_ALL) {
      if (this[agg] === undefined) {
        this[agg] = function (...args) {
          return this.agg(agg, 'all', ...args);
        };
      }
    }

    for (const agg of opts.AGG_NUM) {
      if (this[agg] === undefined) {
        this[agg] = function (...args) {
          return this.agg(agg, 'num', ...args);
        };
      }
    }

    // each function is a function (Column => Column)
    for (const f of opts.FUNCTS_ALL) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'all', ...args);
      };
    }

    for (const f of opts.FUNCTS_NUM) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'num', ...args);
      };
    }

    for (const f of opts.FUNCTS_STR) {
      if (this[f] !== undefined) continue;
      this[f] = function (colId = null, ...args) {
        return this.call(colId, f, 'str', ...args);
      };
    }

    // special cases, when called *without* any param, treat as agg
    for (const op of ['add', 'sub', 'mul', 'div']) {
      if (this[op] === undefined) {
        this[op] = function (...args) {
          if (args.length === 0) {
            return this.agg(op, 'num');
          } else {
            return this.call(args[0], op, 'num', ...args.slice(1));
          }
        };
      }
    }

    // don't assign / drop / push to this.colNames (use df.rename(newName))
    // Object.freeze(this.colNames);

    // don't assign / drop / push to this.cols (use df.drop, df.select or df.sliceCols)
    Object.freeze(this.cols);
  }

  /**
   * @param {!String} name
   * @private
   */
  _registerCol(name) {
    Object.defineProperty(this, name, {
      get() {
        return this.col(name);
      },
      set(newCol) {
        // broadcast
        if (isNumber(newCol) || isString(newCol)) {
          const cIdx = this.colIdx(name);
          for (let i = 0; i < this.length; i++) {
            this.cols[cIdx][i] = newCol;
          }
        } else {
          this.cols[this.colIdx(name)] = newCol;
        }
      },
    });
  }

  get rowsIter() {
    return (function* () {
      for (let r = 0; r < this.length; r++) {
        yield this.row(r);
      }
    }).bind(this)();
  }

  *[Symbol.iterator]() {
    for (let r = 0; r < this.length; r++) {
      yield this.row(r);
    }
  }

  /**
   * @param {!Number} rIdx row index
   */
  *irow(rIdx) {
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      yield this.val(rIdx, cIdx);
    }
  }

  /**
   * @returns {!Set<!Number>} set of column indexes
   * @private
   */
  get _numColIdxs() {
    const { dtypes } = this;
    const colIdxs = new Set();
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      if (dtypes[cIdx].search(dtypeRegex) >= 0) {
        colIdxs.add(cIdx);
      }
    }
    return Object.freeze(colIdxs);
  }

  /**
   * @returns {!Set<!Number>} set of column indexes
   * @private
   */
  get _strColIdxs() {
    const numCols = this._numColIdxs;
    return Object.freeze(new Set(this.colNames.filter((_, idx) => !numCols.has(idx))));
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
    return this.cols[this.colIdx(colId)];
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
   * @param {?Number} [n]
   * @returns {!DataFrame} data frame
   */
  head(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.slice(0, n);
  }

  /**
   * @param {?Number} [n]
   * @returns {!DataFrame} data frame
   */
  tail(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.slice(this.length - n, this.length);
  }

  /**
   * @returns {!Number} number of rows
   */
  get length() {
    if (this.cols[0] === undefined) {
      return 0;
    } else {
      return this.cols[0].length;
    }
  }

  /**
   * @returns {!Number} number of columns
   */
  get nCols() {
    return this.cols.length;
  }

  /**
   * @param {...!String|...!Number} colIds
   * @returns {!DataFrame} data frame
   */
  dtype(...colIds) {
    if (colIds.length === 0) {
      return this.dtype(...this.colNames);
    }
    const colIdxs = colIds.map(id => this.colIdx(id));
    const df = this.agg(col => col.dtype, cIdx => colIdxs.indexOf(cIdx) >= 0).rename(1, 'dtype');
    return df;
  }

  /**
   * @returns {!ColNum|!ColStr} data types for all columns
   */
  get dtypes() {
    return Column.from(this.cols.map(c => c.dtype), 's');
  }

  /**
   * @param {...<!Number|!String>} colIds
   * @return {!DataFrame} data frame
   */
  select(...colIds) {
    if (colIds.length === 0) {
      throw new Error('no column ids provided, try: df.select(0, -2, 3)');
    }

    const cols = [];
    const colNames = [];

    for (const i of new Set(colIds.map(id => this.colIdx(id)))) {
      cols.push(this.cols[i]);
      colNames.push(this.colNames[i]);
    }

    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @param {...!String|...!Number|Array<!Number|!String>} params pairs of colId, newName
   * @returns {!DataFrame} data frame with renamed col
   */
  rename(...params) {
    if (params.length === 1 && Array.isArray(params[0])) {
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
    return new DataFrame(Array.from(this.cols), 'cols', colNames);
  }

  /**
   * @param {!Number|!String|null} [colId]
   * @param {!String|!Function} f
   * @param {'all'|'num'|'str'|!function(!Number): !Boolean} [filter]
   * @param {...*} args
   * @returns {!DataFrame} data frame with f applied to colId
   */
  call(colId = null, f, filter = 'all', ...args) {
    if (colId === null) {
      log.info('colId not specified');
      log.info(`running for ${this.nCols === 1 ? 'the only col' : 'all cols'}`);
    }
    const numCols = this._numColIdxs;
    if (filter === 'num') {
      log.info('ignoring str cols');
      return this.call(colId, f, cIdx => numCols.has(cIdx), ...args);
    } else if (filter === 'str') {
      log.info('ignoring num cols');
      return this.call(colId, f, cIdx => !numCols.has(cIdx), ...args);
    } else if (filter === 'all') {
      return this.call(colId, f, _cIdx => true, ...args);
    } else if (isFunction(filter)) {
      const cols = Array.from(this.cols);
      const colIdxs = (colId === null ? this.colNames : [colId]).map(id => this.colIdx(id));

      // is string (funct name)
      if (isString(f)) {
        for (const cIdx of colIdxs) {
          if (filter(cIdx)) {
            if (cols[cIdx][f] === undefined) {
              throw new Error(`can't call ${f} on column ${this.colNames[cIdx]}`);
            }
            cols[cIdx] = cols[cIdx][f](...args);
          } else {
            log.debug(`skipped running ${f} on col #${cIdx}`);
          }
        }
      } else {
        for (const cIdx of colIdxs) {
          if (filter(cIdx)) {
            cols[cIdx] = f(cols[cIdx], ...args);
          } else {
            log.debug(`skipped running f on col #${cIdx}`);
          }
        }
      }
      return new DataFrame(cols, 'cols', Array.from(this.colNames));
    } else throw new Error(`bad args to DF.call(), filter was: ${filter}`);
  }

  /**
   * @param {?Number|?String} [colId]
   * @param {!RegExp|!String|!Number} pat
   * @param {!String|!Number} repl
   * @param {...*} args
   * @returns {!DataFrame} data frame with f applied to colId
   */
  replace(colId = null, pat, repl, ...args) {
    const filter = isNumber(pat) ? 'num' : 'str';
    return this.call(colId, 'replace', filter, repl, ...args);
  }

  /**
   * @param {!Function|!String} [f]
   * @param {"all"|"num"|"str"|!Function} filter
   * @param {*...} args
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
    // is string
    if (isString(f)) {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (!filter(cIdx)) {
          continue;
        }
        const col = this.cols[cIdx];
        const colName = this.colNames[cIdx];
        colNames.push(colName);
        aggResults.push(col[f]());
      }
    } else {
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        if (!filter(cIdx)) {
          continue;
        }
        const col = this.cols[cIdx];
        const colName = this.colNames[cIdx];
        colNames.push(colName);
        aggResults.push(f(col));
      }
    }
    return new DataFrame(
      [colNames, aggResults.map(x => x.toString())],
      'cols',
      ['column', isString(f) ? f : 'agg'],
      ['s', null],
    );
  }

  /**
   * @param {!Array<!String>|!Array<!Number>|TypedArray} col
   * @param {?String} [name]
   * @returns {!DataFrame} data frame
   */
  appendCol(col, name = null) {
    const colNames = Array.from(this.colNames);
    const cols = Array.from(this.cols);
    cols.push(col);
    if (name === null) {
      colNames.push(colNames.length);
    } else {
      colNames.push(name);
    }
    return new DataFrame(cols, 'cols', colNames);
  }

  /**
   * @param {!DataFrame} other
   * @param {'col'|'row'|'cols'|'rows'|0|1} [axis]
   * @returns {!DataFrame} data frame
   */
  concat(other, axis = 0) {
    if (isNumber(axis)) {
      if (axis < 0) {
        return this.concat(other, axis + 2);
      } else if (axis === 0) {
        const cols = Array.from(this.cols);
        for (let c = 0; c < this.nCols; c++) {
          const myCol = cols[c];
          const otherCol = other.cols[c];
          cols[c] = myCol.concat(otherCol);
        }
        return new DataFrame(cols, 'cols', Array.from(this.colNames));
      }
      // is string
    } else if (isString(axis)) {
      if (axis.search(/^col/i) >= 0) {
        return this.concat(other, 0);
      } else {
        return this.concat(other, 1);
      }
    }

    // else if concat HORIZONTALLY {
    const isDigit = /^\d+$/; // check if has proper column names or just indexes
    let colNames;

    // if columns are indexes, shift them
    if (other.colNames.filter(c => c.toString().search(isDigit)).length === other.colNames.length) {
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

    const cols = this.cols.concat(other.cols);
    return new DataFrame(cols, 'cols', colNames);
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
    } else if (idxs.some(idx => idx < 0)) {
      // resolve negative indexes
      return this.slice(...(idxs.map(idx => (idx < 0 ? idx + this.length : idx))));
    }

    const cols = Array(this.nCols).fill(0);

    // for every pair of indexes
    for (let i = 1; i < idxs.length; i += 2) {
      const lBound = idxs[i - 1];
      const rBound = idxs[i];
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        const col = this.cols[cIdx];
        cols[cIdx] = col.subarray(lBound, rBound);
      }
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * E.g. sliceCols(0)         -> sliceCols(0, end).
   * E.g. sliceCols(0, 10, 20) -> sliceCols(0, 10, 20, end).
   *
   * @param {...!Number|...!String} slices
   * @returns {!DataFrame} data frame
   */
  sliceCols(...slices) {
    if (slices.length === 0) {
      throw new Error('no slice idxs specified (e.g. df.sliceCols(0, -1))');
    } else if (slices.length % 2 !== 0) {
      // odd number of idxs
      return this.sliceCols(...slices, this.nCols - 1);
    }

    // collect column idxs
    const colIds = new Set();

    for (let i = 1; i < slices.length; i += 2) {
      const lBound = this.colIdx(slices[i - 1]);
      let rBound;
      // is num out of bounds
      if (isNumber(slices[i]) && slices[i] >= this.nCols) {
        log.warn(`sliceCols: upper bound > #cols, you wanted cols up to ${slices[i]}th but there are ${this.nCols}`);
        rBound = this.nCols - 1;
      } else {
        rBound = this.colIdx(slices[i]);
      }
      for (let cIdx = lBound; cIdx <= rBound; cIdx++) {
        colIds.add(cIdx);
      }
    }

    // then select them
    return this.select(...colIds);
  }

  /**
   * @param {...!String|...!Number} colIds
   * @returns {!DataFrame} data frame
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
    const cols = Array.from(this.cols);
    for (let i = 0; i < this.nCols; i++) {
      cols[i] = cols[i].filter((_, idx) => tests[idx]);
    }
    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {!String|!Number} val
   * @param {!String|!Number} colId
   * @param {"is"|">"|">="|"<"|"<="|"="|"!="} op
   * @returns {!DataFrame} data frame
   */
  where(val = null, colId = null, op = '=') {
    if (colId === null) {
      if (this.nCols === 1) {
        return this.where(val, 0, op);
      } else {
        throw new Error('no columns specified');
      }
    } else if (op === 'is') {
      return this.filter(x => Object.is(x, val), colId);
    } else if (op === '=') {
      return this.filter(x => x === val, colId);
    } else if (op === '!=') {
      return this.filter(x => x !== val, colId);
    } else if (op === '>') {
      return this.filter(x => x > val, colId);
    } else if (op === '<') {
      return this.filter(x => x < val, colId);
    } else if (op === '<=') {
      return this.filter(x => x <= val, colId);
    } else if (op === '>=') {
      return this.filter(x => x >= val, colId);
    } else {
      throw new Error(`unrecognised op ${op}`);
    }
  }

  /**
   * @param {*} val
   * @param {...!Number|...!String} colIds
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
        const col = this.cols[cIdx];
        if (Object.is(col[i], val)) {
          tests[i] = false;
          break;
        }
      }
    }

    const cols = Array.from(this.cols);

    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      cols[cIdx] = cols[cIdx].filter((_, idx) => tests[idx]);
    }

    return new DataFrame(cols, 'cols', Array.from(this.colNames));
  }

  /**
   * @param {...!Number|...!String} colIds
   * @returns {!DataFrame} data frame
   */
  removeAllOutliers(...colIds) {
    // by default compute for all (numeric) columns
    if (colIds.length === 0) {
      log.info('running removeAllOutliers for all cols');
      return this.removeAllOutliers(...this.colNames);
    }

    const cols = Array.from(this.cols);
    const numCols = this._numColIdxs;

    // indexes of *NUMERIC* columns
    const numColIdxs = new Set(colIds.map(id => this.colIdx(id)).filter(cIdx => numCols.has(cIdx)));

    // store {Q1, Q3, idx} for every *NUMERIC* column
    const IQRs = this.colNames
    // get column indexes
      .map((_, idx) => idx)
    // and now get all NUMERIC columns while leaving gaps to preserve indexing
      .map(idx => (numColIdxs.has(idx) ? this.cols[idx] : null))
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
    // function
    if (isFunction(ord)) {
      return new DataFrame(Array.from(this.rowsIter).sort(ord), 'rows', Array.from(this.colNames));
    } else if (ord === 'asc') {
      return this.sort(cIdx, (r1, r2) => (r1[cIdx] > r2[cIdx] ? 1 : r1[cIdx] < r2[cIdx] ? -1 : 0));
    } else {
      return this.sort(cIdx, (r1, r2) => (r1[cIdx] > r2[cIdx] ? -1 : r1[cIdx] < r2[cIdx] ? 1 : 0));
    }
  }

  /**
   * Shuffle the data frame.
   *
   * @returns {!DataFrame} data frame with shuffle rows
   */
  shuffle() {
    const rIdxs = Array(this.length).fill(0).map((_, idx) => idx);
    const rows = [];
    for (let i = 0; i < this.length; i++) {
      const idx = Math.floor(Math.random() * rIdxs.length);
      const rIdx = rIdxs[idx];
      rows.push(this.row(rIdx));
      rIdxs.splice(idx, 1);
    }

    return new DataFrame(rows, 'rows', Array.from(this.colNames));
  }

  /**
   * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"|null} [dtype]
   * @param {?Array<!Number|!String>} [colNames]
   * @returns {!DataFrame} transposed data frame
   */
  transpose(dtype = null, colNames = null) {
    if (dtype === null) {
      const dt = this.dtypes.reduce((dt1, dt2) => unify(dt1, dt2));
      log.info(`inferred dtype = ${dt}`);
      return this.transpose(dt, colNames);
    }
    log.info('transpose is expensive');
    const cols = Array(this.length).fill(0).map(_ => Column.empty(this.nCols, dtype));
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      for (let rIdx = 0; rIdx < this.length; rIdx++) {
        cols[rIdx][cIdx] = this.cols[cIdx][rIdx];
      }
    }
    return new DataFrame(cols, 'cols', colNames);
  }


  /**
   * @param {?Number} [n] number of cols to select
   * @param {"var"|"stdev"|"mean"|"mad"|"IQR"|"median"|"Q1"|"Q3"|"skewness"|"min"|"range"|"max"|!Function} [agg]
   * @returns {!DataFrame} data frame
   */
  nBest(n = null, agg = 'var') {
    if (n === null) {
      return this.nBest(opts.NBEST, agg);
    } else if (n > this.nCols) {
      log.warn(`n = ${n}, but there is ${this.nCols} cols`);
      return this.nBest(this.nCols, agg);
    }

    let bestCols;

    if (isFunction(agg)) {
      bestCols = this.cols.map((col, idx) => ({ idx, name: this.colNames[idx], score: agg(col) }));
    } else {
      bestCols = this.cols.map((col, idx) => ({ idx, name: this.colNames[idx], score: col[agg]() }));
    }

    bestCols = bestCols.sort((o1, o2) => (o1.score > o2.score ? -1 : o1.score < o2.score ? 1 : 0)).slice(0, n);

    if (bestCols.some(({ name }) => name.toString().search(/\d+/) < 0)) {
      const colNames = [];
      const cols = [];
      for (const o of bestCols) {
        colNames.push(o.name);
        cols.push(this.cols[o.idx]);
      }
      return new DataFrame(cols, 'cols', colNames);
    } else {
      return new DataFrame(bestCols.map(({ idx }) => this.cols[idx]), 'cols');
    }
  }

  /**
   * @param {?Number} n ratio or number of elements
   * @param {?Boolean} wr with replacement
   * @returns {!DataFrame} data frame
   */
  sample(n = null, wr = true) {
    if (n === null) {
      return this.sample(opts.SAMPLE_SIZE, wr);
    } else if (n < 1) {
      // tODO optimize DF.sample(n, wr)
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
   * Produce a count table for values of a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DataFrame} data frame of counts
   */
  counts(colId = null, doSort = true, sortOrd = 'des') {
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
    const col = this.cols[cIdx];
    const colName = isString(this.colNames[cIdx]) ? this.colNames[cIdx] : 'value';
    const df = new DataFrame(
      col.counts(),
      'map',
      [colName, 'count'],
      [this.dtypes[cIdx], 'u32'],
    );
    return doSort ? df.sort(-1, sortOrd) : df;
  }

  /**
   * Produce a ps table for values of a column.
   *
   * @param {!String|!Number} colId
   * @returns {!DataFrame} data frame of pss
   */
  ps(colId = null, doSort = true, sortOrd = 'des') {
    const counts = this.counts(colId, doSort, sortOrd);
    const total = counts.col(-1).add();
    return counts.cast(-1, `f${opts.FLOAT_PREC}`)
      .div(-1, total)
      .rename(-1, 'ps');
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
      .map(_ => Column.empty(col.length, 'u8'));
    for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
      const val = col[rowIdx];
      cols[val][rowIdx] = 1;
    }
    return new DataFrame(cols, 'cols');
  }

  /**
   * @param {!Function|!String} f
   * @param {?Boolean} [withNames]
   * @param {?Boolean} [isCommutative]
   * @param {*|null} [identity]
   * @returns {!DataFrame} data frame
   */
  matrix(f, withNames = true, isCommutative = false, identity = null, ...args) {
    if (isString(f)) {
      // resolve function
      return this.matrix((xs, ys) => xs[f](ys), withNames, isCommutative);
    }

    // only run for numeric cols
    const numCols = this._numColIdxs;
    const colIdxs = [];
    const rows = [];
    const cache = {};
    const { dtypes } = this;

    for (let yIdx = 0; yIdx < this.nCols; yIdx++) {

      const colPrintY = `${dtypes[yIdx]} col ${this.colNames[yIdx] === yIdx ? '#' + yIdx : this.colNames[yIdx] + ' ' + '#' + yIdx}`;

      if (!numCols.has(yIdx)) {
        log.debug(`skipped matrix op on ${colPrintY}`);
        continue;
      }

      // else
      colIdxs.push(yIdx);
      rows.push([]);

      for (let xIdx = 0; xIdx < this.nCols; xIdx++) {

        const colPrintX = `${dtypes[yIdx]} col ${this.colNames[yIdx] === yIdx ? '#' + yIdx : this.colNames[yIdx] + ' ' + '#' + yIdx}`;

        if (!numCols.has(xIdx)) {
          log.debug(`skipped matrix op on ${colPrintX}: not numeric`);
          continue;
        }

        // some ops have a fixed return value when applied to self f(xs, xs) == id
        if (identity !== null && xIdx === yIdx) {
          log.debug(`skipping, f(#${xIdx}, ${xIdx}) = ${identity}`);
          rows[rows.length - 1].push(identity);
          continue;
        }

        const col = this.cols[yIdx];
        const other = this.cols[xIdx];

        let result;

        // sometimes order does not matter: f(xs, ys) === f(ys, xs)
        if (isCommutative) {
          result = cache[`${yIdx}:${xIdx}`];

          // try swap
          if (result === undefined) {
            result = cache[`${xIdx}:${yIdx}`];
          }

          // if fail, compute
          if (result === undefined) {
            result = f(col, other, ...args);
            cache[`${yIdx}:${xIdx}`] = result;
            log.debug(`computed and cached f(#${xIdx}, #${yIdx})`);
          } else {
            log.debug(`CACHE HIT for f(#${xIdx}, #${yIdx})`);
          }
          rows[rows.length - 1].push(result);
        } else {
          rows[rows.length - 1].push(f(col, other, ...args));
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
   * @param {!Number} [p]
   * @param {?Boolean} [withNames]
   * @returns {!DataFrame} data frame
   */
  dist(p = 2, withNames = true) {
    return this.matrix((xs, ys) => xs.dist(ys, p), withNames, true, 0);
  }

  /**
   * @param {?Boolean} [withNames]
   * @returns {!DataFrame} data frame
   */
  dot(withNames = true) {
    return this.matrix('dot', withNames, true, null);
  }

  /**
   * @param {?Boolean} [withNames]
   * @returns {!DataFrame} data frame
   */
  cov(withNames = true) {
    return this.matrix('cov', withNames, true, null);
  }

  /**
   * @param {?Boolean} [withNames]
   * @returns {!DataFrame} data frame
   */
  corr(withNames = true) {
    return this.matrix('corr', withNames, true, 1);
  }

  /**
   * Summaries each column.
   *
   * @returns {DataFrame} data frame
   */
  summary() {
    const info = {
      column: Column.from([]),
      dtype: Column.from([]),
      min: Column.empty(this.nCols),
      max: Column.empty(this.nCols),
      range: Column.empty(this.nCols),
      mean: Column.empty(this.nCols),
      stdev: Column.empty(this.nCols),
    };

    const numCols = this._numColIdxs;

    const { dtypes } = this;

    for (let c = 0; c < this.nCols; c++) {
      info.column.push(this.colNames[c]);
      info.dtype.push(dtypes[c]);

      if (numCols.has(c)) {
        const col = this.cols[c];
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
   * @returns {!DataFrame} shallow copy of the data frame
   */
  copy() {
    return new DataFrame(Array.from(this.cols), 'cols', Array.from(this.colNames));
  }

  /**
   * @returns {!DataFrame} clone (deep copy) of the data frame
   */
  clone() {
    const newCols = [];
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const col = this.cols[cIdx];
      newCols.push(col.clone());
    }
    return new DataFrame(newCols, 'cols', Array.from(this.colNames));
  }

  /**
   * @returns {!Object<Array<!Number>|!Array<!String>>} dictionary
   * @private
   */
  toObj() {
    const dict = {};
    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      const cName = this.colNames[cIdx];
      const col = this.cols[cIdx];
      dict[cName] = Array.from(col);
    }
    return dict;
  }

  /**
   * @returns {!String} json-stringified data frame
   */
  toJSON() {
    return JSON.stringify(this.toObj());
  }

  /**
   * @param {!String} filePath
   * @returns {!DataFrame} data frame
   */
  toCSV(filePath) {
    const stringify = require('csv-stringify/lib/sync');
    const a = Array.from(this.rowsIter);
    a.unshift(this.colNames);
    return stringify(a);
  }

  /**
   * @returns {!String} HTML
   */
  toHTML() {
    const chunks = [];

    chunks.push('<table>');
    chunks.push('<tr>');

    for (const name of this.colNames) {
      chunks.push('<th>');
      chunks.push(name.toString());
      chunks.push('</th>');
    }

    chunks.push('</tr>');

    for (let rIdx = 0; rIdx < this.length; rIdx++) {
      chunks.push('<tr>');

      for (const val of this.irow(rIdx)) {
        chunks.push(`<td>${val.toString()}</td>`);
      }

      chunks.push('</tr>');
    }

    chunks.push('</table>');
    return chunks.join('');
  }

  /**
   * @param {!String} filePath
   */
  saveJSON(filePath) {
    if (filePath.search(/\.json$/i) < 0) {
      log.warn(`bad file name ${filePath}, expected *.json file name`);
    }
    const out = createWriteStream(filePath);
    out.end(JSON.stringify(this.toObj()));
    log.info(`saved JSON to ${filePath}`);
  }


  /**
   * @param {!String} filePath
   */
  saveHTML(filePath) {
    if (filePath.search(/\.x?html\d?$/i)) {
      const out = createWriteStream(filePath);

      out.write('<table>');
      out.write('<tr>');

      for (const name of this.colNames) {
        out.write(`<th>${name.toString()}</th>`);
      }

      out.write('</tr>');

      for (let rIdx = 0; rIdx < this.length; rIdx++) {
        out.write('<tr>');

        for (const val of this.irow(rIdx)) {
          out.write('<td>');
          out.write(val.toString());
          out.write('</td>');
        }

        out.write('</tr>');
      }

      out.end('</table>');
      log.info(`saved HTML to ${filePath}`);
    } else {
      throw new Error('bad file name, expected *.html file name');
    }
  }

  /**
   * @param {!String} filePath
   */
  saveCSV(filePath) {
    if (filePath.search(/\.csv$/i) >= 0) {
      const stringifier = stringifyCSV();
      const out = createWriteStream(filePath);
      const header = this.colNames.map(cName => cName.toString());

      stringifier.on('error', err => log.error(err.message));

      stringifier.on('data', row => out.write(row));

      stringifier.write(header);

      for (const r of this.rowsIter) {
        stringifier.write(r);
      }
      log.info(`saved CSV to ${filePath}`);
    } else {
      throw new Error(`bad file name, expected *.csv file name`);
    }
  }

  /**
   * @returns {!Array<!String>} datasets
   */
  static get dataSets() {
    const nodeStack = Array.from(opts.DATASETS);
    const datasets = new Set();
    let i = 0;
    while (i < nodeStack.length) {
      const path = resolve(nodeStack[i]);
      if (path.search(/\.[._]\w+$|node_modules$/) >= 0) {
        i++;
        continue;
      }
      const stats = statSync(path);
      if (stats.isDirectory()) {
        for (const f of readdirSync(path)) {
          nodeStack.push(join(path, f));
        }
      } else if (stats.isFile()) {
        if (path.search(/\.(csv|json)$/) >= 0) {
          datasets.add(path);
        }
      }
      i++;
    }
    return Array.from(datasets);
  }

  /**
   * Construct a DataFrame from columns.
   *
   * @param {...!Array<!String>|...!Array<!Number>|...!TypedArray|...!ColumnNum|...!ColumnStr} cols
   * @returns {!DataFrame}
   */
  static of(...cols) {
    return new DataFrame(cols, 'cols');
  }

  /**
   * Sets an option.
   *
   */
  static get opts() {
    return opts;
  }

  /**
   * @param {?Number} [n]
   * @param {?Number} [m]
   */
  print(n = null, m = null) {
    console.log(this.toString(n, m));
  }

  [util.inspect.custom](depth, options) {
    return this.toString();
  }

  static setPrinting(opt = 'minimal') {
    if (opt.search(/^mini/i) >= 0) {
      log.warn('minimal printing ON');
      Object.assign(opts, MINIMAL_PRINTING);
    } else if (opt.search(/^def/) >= 0) {
      log.warn('default printing ON');
      Object.assign(opts, DEFAULT_PRINTING);
    } else if (opt.search(/^prog/) >= 0) {
      log.warn('programmer printing ON');
      Object.assign(opts, PROGRAMMER_PRINTING);
    } else throw new Error(`unrecognised printing opt ${opt}, try "minimal", "programmer" or "default"`);
  }

  /**
   * @param {!Number} [n]
   * @param {!Number} [m]
   * @returns {!String} string representation of the data frame
   */
  toString(n = null, m = null) {
    // in node debugger rows and columns are null
    const termHeight = process.stdout.rows || 12;
    const termWidth = process.stdout.columns || 50;

    if (n === null) {
      const newN = Math.min(this.length, termHeight - 7);
      return this.toString(newN);

    } else if (m === null) {
      return this.toString(0, n);

    } else if (n < 0) {
      return this.toString(n + this.length, m);

    } else if (m < 0) {
      return this.toString(n, m + this.length);

    } else if (n > this.length) {
      log.warn(`n = ${n}, but there is ${this.length} rows`);
      return this.toString(this.length - n, this.length);

    } else if (m > this.length) {
      log.warn(`m = ${m}, but there is ${this.length} rows`);
      return this.toString(Math.max(0, this.length - (m - n)), this.length);

    } else if (this.nCols === 0) {
      return opts.EMPTY_STR;
    }

    const { dtypes } = this;

    // always has the actual number of columns INCLUDING the optional index
    const nCols = this.nCols + (opts.SHOW_INDEX ? 1 : 0);
    let colWidth = opts.MIN_COL_WIDTH;

    // e.g. for 3 cols you have 2 * SPACE_BEWEEN so always subtract a single SPACE_BETWEEN
    const widthTaken = (this.nCols * (colWidth + opts.SPACE_BETWEEN)) - opts.SPACE_BETWEEN;

    if (widthTaken < termWidth) {
      const perCol =  (termWidth - widthTaken) / nCols;
      colWidth += Math.floor(perCol);
    }

    // this will be concatenated and displayed
    const rows = [];

    // index marker
    const headerRow = opts.SHOW_INDEX ? [opts.IDX_MARKER] : [];

    for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
      // col name could be an int so convert
      let h = this.colNames[cIdx].toString();

      // trunc column headings (if needed)
      if (h.length > colWidth) {
        h = h.slice(0, colWidth - opts.DOTS.length) + opts.DOTS;
      }

      if (opts.PRINT_TYPES) {
        // pad to reserve space for opts.PAD_STR and dtype (injected later after col len is computed)
        h = opts.PAD_STR.repeat(dtypes[cIdx].length) + ' ' + h.toString();
      } else {
        // no padding needed
        h = h.toString();
      }
      headerRow.push(h);
    }

    rows.push(headerRow);

    // info about not displayed rows
    // .. ... (2 more) .. .. <- THIS
    // 3
    // 4
    // 5
    if (opts.SHOW_MORE && n > 0 && this.nCols > 0) {
      const arr = Array(nCols).fill(opts.DOTS);
      arr[0] = `(${n} more)`;
      rows.push(arr);
    }

    // memoize
    const numCols = this._numColIdxs;

    // now the actual content of the table
    // remember about optional index (inject AFTER)!
    for (let rIdx = n; rIdx < m; rIdx++) {

      // initialise
      const row = Array(this.nCols).fill('');

      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {

        const val = this.val(rIdx, cIdx);
        const s = val.toString();

        const isNum = numCols.has(cIdx);
        const isFloat = isNum && dtypes[cIdx].startsWith('f');

        if (isFloat) {
          row[cIdx] = fmtFloat(val, opts.PRINT_PREC);
          continue;
        }

        const isStr = !isNum && isString(val);
        const isTooLong = isStr && s.length > colWidth;

        if (isTooLong) {
          row[cIdx] = s.slice(0, colWidth - opts.DOTS.length) + opts.DOTS;
          continue;
        }

        row[cIdx] = s;
      }
      if (opts.SHOW_INDEX) {
        row.unshift(rIdx.toString(opts.INDEX_BASE));
      }
      rows.push(row);
    }

    if (this.length === 0) {
      const emptyInfo = Array(this.nCols).fill(opts.EMPTY);
      if (opts.SHOW_INDEX) {
        emptyInfo.unshift('');
      }
      rows.push(emptyInfo);

    } else if (opts.SHOW_MORE && m < this.length && this.nCols > 0) {
      const arr = Array(nCols).fill(opts.DOTS);
      arr[0] = `(${this.length - m} more)`;
      rows.push(arr);
    }

    if (opts.MEM_INFO) {
      // assume str
      const memInfo = Array(this.nCols).fill(opts.MEM_INFO_STR);

      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        const col = this.cols[cIdx];

        // num column
        if (col.memory !== undefined) {
          memInfo[cIdx] = fmtFloatSI(col.memory(), 1, 'B');
        }
      }

      /* different memory indiciator for index
      (doesn't acutally take any memory since it's just printed) */
      if (opts.SHOW_INDEX) {
        memInfo.unshift(opts.MEM_INFO_INDEX);
      }

      rows.push(memInfo);
    }

    // lengths of each column
    const colWidths = Array(nCols)
      .fill(0)
      .map((_, cIdx) => rows
        .map(r => r[cIdx].toString().length)
        .reduce((len1, len2) => Math.max(len1, len2), 1));

    // inject underline AFTER col headings
    rows.splice(1, 0, colWidths.map(l => opts.UNDERLINE.repeat(l)));
    // same for bottom but optional, the row before memory info (IF PRESENT)
    if (opts.UNDERLINE_BOT) {
      if (opts.MEM_INFO) {
        rows.splice(rows.length - 1, 0, colWidths.map(l => opts.UNDERLINE.repeat(l)));
      } else {
        rows.splice(rows.length, 0, colWidths.map(l => opts.UNDERLINE.repeat(l)));
      }
    }

    if (opts.PRINT_TYPES) {
      if (opts.SHOW_INDEX) {
        // inject dtypes for all headings
        for (let cIdx = 1; cIdx < nCols; cIdx++) {
          const len = colWidths[cIdx];
          const dtype = dtypes[cIdx - 1];
          const h = headerRow[cIdx].trim();
          headerRow[cIdx] = dtype + opts.PAD_STR.repeat(len - h.length - dtype.length) + h;
        }
        // replace headerRow (without type labels) with typed
        rows[0] = headerRow;
      } else {
        // inject dtypes for all headings
        for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
          const len = colWidths[cIdx];
          const dtype = dtypes[cIdx];
          const h = headerRow[cIdx].trim();
          headerRow[cIdx] = dtype + opts.PAD_STR.repeat(len - h.length - dtype.length) + h;
        }
        // replace headerRow (without type labels) with typed
        rows[0] = headerRow;
      }
    }

    // +1 for space between cols
    const tooLong = colWidths.reduce((l1, l2) => l1 + l2 + opts.SPACE_BETWEEN, -opts.SPACE_BETWEEN) > termWidth;

    if (tooLong) {
       /* remove cols in the middle
          this ensures that there is n - 1 SPACE_BETWEEN for every n cols */
      const nColsToShow = Math.floor((termWidth + opts.SPACE_BETWEEN) / (colWidth + opts.SPACE_BETWEEN));

      /* C C C LEFT C C C RIGHT C C C
         should remove Cs on the left of LEFT and on the right of RIGHT
         C C C ... C C C */
      const offset = Math.floor(nColsToShow / 2);
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        let s = ''; // initialise
        for (let cIdx = 0; cIdx < offset; cIdx++) {
          s += rows[rIdx][cIdx].padStart(colWidths[cIdx] + opts.SPACE_BETWEEN, opts.PAD_STR);
        }
        s += opts.PAD_STR.repeat(opts.SPACE_BETWEEN) + opts.DOTS;
        for (let cIdx = nCols - offset; cIdx < nCols; cIdx++) {
          s += rows[rIdx][cIdx].padStart(colWidths[cIdx] + opts.SPACE_BETWEEN, opts.PAD_STR);
        }
        rows[rIdx] = s;
      }
    } else {
      // display all (it fits on the screen)
      for (let rIdx = 0; rIdx < rows.length; rIdx++) {
        rows[rIdx] = rows[rIdx].map((val, cIdx) =>
          val.padStart(colWidths[cIdx], opts.PAD_STR))
             .join(opts.PAD_STR.repeat(opts.SPACE_BETWEEN));
      }
    }
    return rows.join('\n');
  }
}

module.exports = Object.freeze(DataFrame);
