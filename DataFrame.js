/* eslint-disable no-nested-ternary,max-lines,complexity */
/**
 * TODO document cum ops
 * TODO replace is broken
 * TODO binarizer
 * TODO document imports
 * TODO document matrix ops
 * TODO document add, mul, div, sub
 * TODO document opts, printing presets
 * TODO document examples of matrix ops, aggs, functs
 * TODO calculate the *base* size of each column (pointers are 8B)
 */
const util = require('util');
const { join, resolve, dirname } = require('path');
const {
  readdirSync,
  readFileSync,
  existsSync,
  writeFileSync,
  statSync
} = require('fs');

const request = require('sync-request');
const parseCSV = require('csv-parse/lib/sync');

const Column = require('./Column');
const { randInt } = require('./rand');
const {
  fmtFloat,
  fmtFloatSI,
  dtypeRegex,
  isNumber,
  isString,
  isRegExp,
  isURL,
  isMap,
  isSameType,
  isGenerator,
  isObject,
  walkFiles,
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
   * @param {DataFrame|GeneratorFunction|!Object<string|number,number|string|string[]|number[]|ColStr|ColNum|TypedArray>|Array<Array<number|string>>|Array<TypedArray|number[]|string[]|ColStr|ColNum>|!Map<String,number|string|number[]|string[]>} data
   * @param {string} [what]
   * @param {string[]|?ColStr} [colNames] labels for every column (#cols === #labels)
   * @param {?ArrayLike<?DType|'s'>} [dtypes]
   */
  constructor(data = [], what = '', colNames = null, dtypes = null) {
    const prefix = `${this.constructor.name}.constructor()`;
    const logIt  = (lvl, msg) => log[lvl](`${prefix} ${msg}`);
    const warn   = (msg) => logIt('warn', msg);
    const info   = (msg) => logIt('info', msg);
    const debug  = (msg) => logIt('debug', msg);
    if (what.toLowerCase() !== what) {
      debug(`lowercasing "${what}"`);
      return new DataFrame(data, what.toLowerCase(), colNames, dtypes);

      // another data frame, shallow copy it
    } else if (what === 'df') {
      info(`data is another ${this.constructor.name}, making a shallow copy`);
      return new DataFrame(
        [...data.cols],
        'cols',
        [...data.colNames],
        data.dtypes,
      );
    } else if (isSameType(this, data)) {
      info(`detected ${this.constructor.name}`);
      return new DataFrame(data, 'df', colNames, dtypes);
    } else if (isString(data)) {
      if (what.startsWith('url')) {
        info(`GET ${data}`);
        let newWhat;
        if (what === 'url') {
          newWhat = data.search(/\.json$/i) >= 0 ? 'json' : 'csv';
        } else {
          newWhat = what.replace(/^url/, '');
        }
        const s = request('GET', data).getBody().toString('utf-8');
        return new DataFrame(s, newWhat, colNames, dtypes);
      } else if (isURL(data)) {
        info('detected URL');
        return new DataFrame(data, `url${what}`, colNames, dtypes);
      } else if (what.startsWith('json')) {
        info('data is JSON string, parsing');
        if (what === 'json') {
          info(`assuming input is JSON object`);
          return new DataFrame(JSON.parse(data), 'obj', colNames, dtypes);
        } else {
          const hint = what.replace(/^json/, '');
          info(`using further hint "${hint}"`);
          return new DataFrame(JSON.parse(data), hint, colNames, dtypes);
        }
      } else if (what.startsWith('csv')) {
        info('data is CSV string, parsing');
        const rows = parseCSV(data, { skip_empty_lines: true, trim: true });
        if (colNames === null) {
          warn(`column names not provided, assuming first row is column names`);
          const header = rows.splice(0, 1)[0];
          return new DataFrame(rows, 'rows', header, dtypes);
        } else {
          debug(`using provided column names ${colNames.toString()}`);
          return new DataFrame(rows, 'rows', colNames, dtypes);
        }
      } else if (what.startsWith('file')) {
        info(`data is file "${data}"`);
        if (what === 'file') {
          const ext = (/\.([^.]+)$/i.exec(data) || [null, 'csv'])[1];
          info(`using extension ".${ext}" as hint`);
          return new DataFrame(readFileSync(data).toString('utf-8'), ext, colNames, dtypes);
        } else {
          const newWhat = what.replace(/^file/i, '');
          info(`using provided hint for file content type "${newWhat}"`);
          return new DataFrame(readFileSync(data).toString('utf-8'), newWhat, colNames, dtypes);
        }
      } else if (existsSync(data)) {
        info(`detected existing file "${data}"`);
        return new DataFrame(data, 'file', colNames, dtypes);

        // dataset name with *.csv ending (walk recursively)
      } else if (data.search(/\.(csv|json)$/i) >= 0) {
        info(`data is dataset file name "${data}"`);
        for (const path of walkFiles(...opts.DATASETS)) {
          if (path.endsWith(data)) {
            debug(`located dataset "${path}"`);
            return new DataFrame(path, 'file', colNames, dtypes);
          }
        }

        // dataset name WITHOUT *.csv ending
      } else {
        info(`data is dataset name "${data}" (no extension)`);
        for (const path of walkFiles(...opts.DATASETS)) {
          if (path.search(new RegExp(`${data}\\.(json|csv)`, 'i')) >= 0) {
            debug(`located dataset "${path}"`);
            return new DataFrame(path, 'file', colNames, dtypes);
          }
        }
      }

      const lookedIn = opts.DATASETS.concat([dirname(data)]).map((p) => resolve(p)).join(', ');
      throw new Error(`failed to find file, looked for a dataset in ${lookedIn} (you might want to push your dir to opts.DATASETS OR set 'what', see API)`);
    } else if (what.startsWith('gen')) {
      info(`input is generator`);
      const rows = [];
      for (const r of data()) {
        rows.push(r);
      }
      let newWhat = 'rows';
      if (what !== 'gen') {
        newWhat = what.replace(/^gen/, '');
      } else {
        info('assuming row generator');
      }
      return new DataFrame(rows, newWhat, colNames, dtypes);
    } else if (isGenerator(data)) {
      info(`input is row generator`);
      return new DataFrame(data, 'gen', colNames, dtypes);

      // javascript Object (PARSED)
    } else if (what.startsWith('obj')) {
      info('received Object');

      // if { String: Number | String }
      for (const key of Object.keys(data)) {
        const val = data[key];
        if (isNumber(val) || isString(val)) {
          info('treating keys as column 1 and values as column 2');
          return new DataFrame(
            [Object.keys(data), Object.values(data)],
            'cols',
            colNames === null ? ['Key', 'Value'] : colNames,
            dtypes,
          );
        }
      }

      // else
      info('treating keys as column names and values as columns');
      return new DataFrame(
        Object.values(data),
        'cols',
        Object.keys(data),
        dtypes,
      );
    } else if (isObject(data)) {
      info('detected Object');
      return new DataFrame(data, `obj${what}`, colNames, dtypes);

      // map { col1 => col2, ... }
    } else if (what.startsWith('map')) {
      info(`data is Map (len is ${data.size})`);

      // reverse logic to Object (above)

      for (const v of data.values()) {
        if (!isString(v) && !isNumber(v)) {
          info('using keys as column names and values as columns');
          return new DataFrame(
            [...data.values()],
            'cols',
            [...data.keys()],
            dtypes,
          );
        }
      }

      info('using keys as column 1 and values as column 2');
      const keys = [...data.keys()];
      const values = [...data.values()];
      return new DataFrame(
        [keys, values],
        'cols',
        colNames === null ? ['Key', 'Value'] : colNames,
        dtypes,
      );
    } else if (isMap(data)) {
      info('detected Map');
      return new DataFrame(data, `map${what}`, colNames, dtypes);

      // array of rows
    } else if (what.startsWith('rows')) {
      info(`data is array of ${data.length} rows, transposing to columns`);
      return new DataFrame(transpose(data), 'cols', colNames, dtypes);

      // array of cols
    } else if (what.startsWith('cols')) {
      debug(`input is array of ${data.length} columns`);
      this.cols = data.map((c, cIdx) => {
        const printName = `col #${cIdx}${colNames !== null && colNames[cIdx] !== undefined ? ` (${colNames[cIdx]})` : ''}`;
        const isCol = Column.isCol(c);
        if (isCol) {
          debug(`${printName} is already a Column`);
        }
        const dtypeGiven = dtypes !== null && dtypes[cIdx] !== null && dtypes[cIdx] !== undefined;
        debug(dtypeGiven ? `dtype "${dtypes[cIdx]}" given for ${printName}` : `need to guess dtype of ${printName}`);
        const noNeedToConvert = isCol && (!dtypeGiven || c.dtype === dtypes[cIdx]);
        if (noNeedToConvert) {
          debug(`no need to convert ${printName}`);
          return c;
        }
        debug(`converting ${printName}`);
        // else
        return Column.from(c, !dtypes || !dtypes[cIdx] ? null : dtypes[cIdx], false);
      });

      const { nCols } = this;
      if (colNames === null) {
        this.colNames = Column.from(Array(nCols).fill('').map((_, idx) => `col${idx}`));
      } else {
        this.colNames = Column.from(colNames.map((cName) => cName.toString()), 's');
        for (let i = 0; i < nCols; i++) {
          const colName = this.colNames[i];
          const attributes = {
            get() { return this[i]; },
            set(newCol) {
              this[i] = Column.from(newCol);
              debug(`column ${colName} replaced with ${this[i].toString()}`);
            },
          };
          Object.defineProperty(this.cols, colName, attributes);
          debug(`registered col.${colName} to point to col[${i}]`);
        }
        debug(`used provided column names: [${this.colNames.join(', ')}]`);
      }
    } else if (what === '') {
      return new DataFrame(data, 'cols', colNames, dtypes);
    } else throw new Error('unrecognised input data');

    const attrNames = new Set(this.colNames);

    const { nCols } = this;

    // index using cols integers AND column names
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      attrNames.add(cIdx);
    }

    /*
     * easy access e.g. df.age, df.salary
     * easy replacement (assignment) of cols e.g. df.age = df2.age;
     * easy broadcasting e.g. df.label = 0;
     */
    for (const name of attrNames) {
      if (this[name] === undefined && isString(name)) {
        Object.defineProperty(this, name, {
          get() { return this.col(name); },
          set(val) {
            this.cols[this.colIdx(name)] = isNumber(val) || isString(val)
              // broadcast
              ? Column.repeat(this.length, val)
              // replace
              : val;
          },
        });
      }
    }

    const isUndef = (f) => this[f] === undefined;

    // functs and aggs are forwarded to the underlying column
    for (const section of Object.keys(opts.AGG)) {
      for (const f of opts.AGG[section].filter(isUndef)) {
        switch (section) {
        case 'num':
          this[f] = function (...args) { return this.numeric.agg(f, ...args); };
          break;
        case 'str':
          this[f] = function (...args) { return this.nominal.agg(f, ...args); };
          break;
        case 'all':
          this[f] = function (...args) { return this.agg(f, ...args); };
          break;
        default:
          throw new Error(`unrecognised section "${section}" in opts.AGG`);
        }
      }
    }

    // each function is a function (Column => Column)
    for (const section of Object.keys(opts.FUNCTS)) {
      for (const f of opts.FUNCTS[section].filter(isUndef)) {
        switch (section) {
        case 'num':
          this[f] = function (colId = null, ...args) {
            const resultDF = this.clone();
            const numDF = this.numeric.call(colId, f, ...args);
            const { numColIdxs } = this;
            let numCIdx = 0;
            for (let cIdx = 0; cIdx < nCols; cIdx++) {
              if (numColIdxs.has(cIdx)) {
                resultDF.cols[cIdx] = numDF.cols[numCIdx];
                numCIdx++;
              }
            }
            return resultDF;
          };
          break;
        case 'str':
          this[f] = function (colId = null, ...args) {
            const resultDF = this.clone();
            const strDF = this.nominal.call(colId, f, ...args);
            const { numColIdxs } = this;
            let strCIdx = 0;
            for (let cIdx = 0; cIdx < nCols; cIdx++) {
              if (!numColIdxs.has(cIdx)) {
                resultDF.cols[cIdx] = strDF.cols[strCIdx];
                strCIdx++;
              }
            }
            return resultDF;
          };
          break;
        case 'all':
          this[f] = function (colId = null, ...args) { return this.call(colId, f, ...args); };
          break;
        default:
          throw new Error(`unrecognised section "${section}" in opts.AGG`);
        }
      }
    }

    // special cases, when called *without* any param, treat as agg
    for (const f of [
      'add', 'sub', 'mul', 'div', 'pow'
    ].filter(isUndef)) {
      this[f] = function (...args) {
        if (args.length === 0) {
          debug(`no args to this.${f}() so treating as aggregate`);
          return this.numeric.agg(f);
        } else {
          const fst = args[0];
          return this.numeric.call(fst, f, ...args.slice(1));
        }
      };
    }
  }

  /**
   * Construct a DataFrame from columns.
   *
   * @param {...ArrayLike<*>} cols
   * @returns {DataFrame}
   */
  static of(...cols) { return new DataFrame(cols, 'cols'); }

  * [Symbol.iterator]() {
    const { rows } = this;
    const n = this.length;
    for (let rIdx = 0; rIdx < n; rIdx++) {
      yield rows[rIdx];
    }
  }

  get rows() {
    return new Proxy(this.cols, {

      /**
       * @param {Column[]} cols
       * @param {number} idx
       * @returns {Array<*>}
       */
      get(cols, idx) { return cols.map((col) => col[idx]); },

      /**
       *
       * @param {Column[]} cols
       * @param {Array<*>} row
       * @returns {boolean}
       */
      has(cols, row) {
        const nCols = cols.length;
        if (nCols === 0) {
          return false;
        }
        const nRows = cols[0].length;
        for (let rIdx = 0; rIdx < nRows; rIdx++) {
          let eq = true;
          for (let cIdx = 0; cIdx < nCols; cIdx++) {
            if (row[cIdx] !== cols[cIdx][rIdx]) {
              eq = false;
              break;
            }
          }
          if (eq) {
            return true;
          }
        }
        return false;
      },

      /**
       * @param {Column[]} cols
       * @param {number} rIdx
       * @param {Array<*>} val
       */
      set(cols, rIdx, val) {
        for (let cIdx = 0; cIdx < cols.length; cIdx++) {
          // eslint-disable-next-line no-param-reassign
          cols[cIdx][rIdx] = val[cIdx];
        }
      }
    });
  }

  /**
   * @returns {Set<number>} set of column indexes
   */
  get numColIdxs() {
    const colIdxs = new Set();
    const { dtypes, nCols } = this;
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      if (dtypes[cIdx].search(dtypeRegex) >= 0) {
        colIdxs.add(cIdx);
      }
    }
    return Object.freeze(colIdxs);
  }

  /**
   * @returns {Set<number>} set of column indexes
   */
  get strColIdxs() {
    const numCols = this.numColIdxs;
    return Object.freeze(new Set(this.colNames.filter((_, idx) => !numCols.has(idx))));
  }

  /**
   * @param {string|number} colId
   * @returns {number} column index
   */
  colIdx(colId) {
    const msg = (m) => `${this.constructor.name}.colIdx() ${m}`;
    // resolve named column
    if (Number.isInteger(colId)) {
      // resolve negative idx
      if (colId < 0) {
        const newColIdx = this.nCols + colId;
        log.debug(msg(`colId ${colId} negative, resolving to #${newColIdx}`));
        return this.colIdx(newColIdx);
      } else if (colId >= this.nCols) {
        throw new Error(msg(`#${colId}, no such column, out of bounds`));
      } else {
        return colId;
      }
    } else if (isString(colId)) {
      const idx = this.colNames.findIndex((colName) => colName === colId);
      if (idx < 0) {
        throw new Error(msg(`failed to find matching column for "${colId}"`));
      }
      log.debug(msg(`col "${colId}" is string, resolved to #${idx}`));
      return idx;
    } else throw new Error(msg(`bad input, expected number or string but got ${colId}`));
  }

  /**
   * @returns {DataFrame} a data frame with numeric cols
   */
  get numeric() {
    const { numColIdxs } = this;
    return this.select((cId) => numColIdxs.has(this.colIdx(cId)));
  }

  /**
   * @returns {DataFrame} a data frame with numeric cols
   */
  get nominal() {
    const { numColIdxs } = this;
    return this.select((cId) => !numColIdxs.has(this.colIdx(cId)));
  }

  /**
   * @param {string|number} colId
   * @returns {string[]|TypedArray} column
   */
  col(colId) { return this.cols[this.colIdx(colId)]; }

  /**
   * @param {?number} [n]
   * @returns {DataFrame} data frame
   */
  head(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.slice(0, n);
  }

  /**
   * @param {?number} [n]
   * @returns {DataFrame} data frame
   */
  tail(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.slice(this.length - n, this.length);
  }

  /**
   * @returns {number} number of rows
   */
  get length() {
    if (this.cols[0] === undefined) {
      return 0;
    } else {
      return this.cols[0].length;
    }
  }

  /**
   * @returns {number} number of columns
   */
  get nCols() { return this.cols.length; }

  /**
   * @param {...(string|number)} colIds
   * @returns {DataFrame} data frame
   */
  dtype(...colIds) {
    if (colIds.length === 0) {
      return this.dtype(...this.colNames);
    }
    const colIdxs = colIds.map((id) => this.colIdx(id));
    return this.select((cIdx) => colIdxs.indexOf(cIdx) >= 0).agg((col) => col.dtype).rename(1, 'dtype');
  }

  /**
   * @returns {ColStr} data types for all columns
   */
  get dtypes() { return Column.from(this.cols.map((c) => c.dtype), 's'); }

  /**
   * @param {...(number|string|RegExp|function((string|number)): boolean)} params
   * @returns {DataFrame} data frame
   */
  select(...params) {
    if (params.length === 0) {
      throw new Error('the DF is empty because no column IDs provided, try: df.select(0, -2, 3)');
    } else if (params.length === 1 && isRegExp(params[0])) {
      const regex = params[0];
      return this.select((cName) => isString(cName) && cName.search(regex) >= 0);
    } else if (params.length === 1 && isFunction(params[0])) {
      const f = params[0];
      return this.select(...(this.colNames.filter((name) => f(name) || f(this.colIdx(name)))));
    } else {
      const cols = [];
      const colNames = [];
      const dtypes = [];

      for (const i of new Set(params.map((id) => this.colIdx(id)))) {
        cols.push(this.cols[i]);
        colNames.push(this.colNames[i]);
        dtypes.push(this.dtypes[i]);
      }

      return new DataFrame(cols, 'cols', colNames, dtypes);
    }
  }

  /**
   * @param {...(number|string|RegExp|function((string|number)): boolean)} params
   * @returns {DataFrame} data frame
   */
  selectRows(...params) {
    if (params.length === 0) {
      throw new Error('the DF is empty because no row IDs provided, try: df.selectRows(0, -2, 3)');
    } else if (params.length === 2 && isRegExp(params[0])) {
      return this.selectRows((val) => val.search(params[0]) >= 0, params[1]);
    } else if (params.length === 2 && isFunction(params[0])) {
      const colId = params[1];
      const f = params[0];
      // focus on one column
      const col = this.col(colId);
      const tests = Array(col.length).fill(false).map((_, rIdx) => f(col[rIdx], rIdx));
      return new DataFrame(
        this.cols.map((c) => c.filter((_, rIdx) => tests[rIdx])),
        'cols',
        [...this.colNames],
        [...this.dtypes],
      );
    } else if (params.length === 1 && isFunction(params[0])) {
      throw new Error(`${this.constructor.name}.selectRows() not implemented yet`);
    } else if (params.reduce((ok, focus) => ok && isNumber(focus) && Number.isInteger(focus))) {
      throw new Error(`${this.constructor.name}.selectRows() not implemented yet`);
    } else {
      throw new Error(`${this.constructor.name}.selectRows() didn't understand args ${params.map((x) => x.toString()).join(', ')}`);
    }
  }

  /**
   * @param {...(string|number)} params pairs of colId, newName
   * @returns {DataFrame} data frame with renamed col
   */
  rename(...params) {
    const msg = (m) => `${this.constructor.name}.rename() ${m}`;
    if (params.length === 1 && Array.isArray(params[0])) {
      const pairs = params[0].map((newName, cIdx) => [cIdx, newName]);
      const args = pairs.reduce((pair1, pair2) => pair1.concat(pair2), []);
      return this.rename(...args);
    } else if (params.length === 1 && this.nCols === 1) {
      log.info(msg('colId not specified for rename'));
      return this.rename(0, params[0]);
    } else if (params.length % 2 !== 0) {
      throw new Error(msg('you need to provide pairs of colId, newName (e.g. df.rename(1, "Width", -2, "Length"))'));
    }
    const colNames = [...this.colNames];
    for (let i = 1; i < params.length; i += 2) {
      const colId = params[i - 1];
      const newName = params[i];
      const colIdx = this.colIdx(colId);
      colNames[colIdx] = newName;
    }
    return new DataFrame([...this.cols], 'cols', colNames, [...this.dtypes]);
  }

  /**
   * @param {?number|string} [colId]
   * @param {string|function(Col): Col} f
   * @param {...*} args
   * @returns {DataFrame} data frame with f applied to colId
   */
  call(colId = null, f, ...args) {
    if (isString(f)) {
      return this.call(colId, (col) => col[f](...args));
    }
    if (colId === null) {
      log.info(`${this.constructor.name}.call() colId not specified, running for all cols`);
      return [...this.colNames].reduce((df, cName) => df.call(cName, f, ...args), this);
    }
    const cols = [...this.cols];
    const cIdx = this.colIdx(colId);
    cols[cIdx] = f(cols[cIdx], ...args);
    return new DataFrame(cols, 'cols', [...this.colNames], this.dtypes.map((t, idx) => idx === cIdx ? null : t));
  }

  /**
   * @param {number} idx
   * @returns {string}
   * @private
   */
  _colName(idx) {
    return `col #${idx}${this.colNames[idx] === idx ? '' : ` (${this.colNames[idx]})`} dtype ${this.dtypes[idx]}`;
  }

  /**
   * @param {function(ColNum): number} [f]
   * @param {...*} args
   * @returns {DataFrame} data frame
   */
  agg(f = (xs) => xs.length, ...args) {
    if (isString(f)) {
      return this.agg((col) => col[f](...args)).rename(-1, f);
    }
    const colNames = [];
    const aggResults = [];
    const { nCols } = this;
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      const col = this.cols[cIdx];
      const colName = this.colNames[cIdx];
      colNames.push(colName);
      aggResults.push(f(col, ...args));
    }
    return new DataFrame(
      [colNames, aggResults.map((x) => x.toString())],
      'cols',
      ['column', 'agg'],
      ['s', null],
    );
  }

  /**
   * @param {number|string} colId
   * @param {function(ColNum): number} [f]
   * @param {...*} args
   * @returns {DataFrame} data frame
   */
  groupBy(colId, f = (xs) => xs.length, ...args) {
    if (isString(f)) {
      return this.groupBy(colId, (xs) => xs[f](...args)).rename(-1, f);
    }
    const cIdx = this.colIdx(colId);
    const index = new Map();
    for (const r of this) {
      const v = r[cIdx];
      const maybe = index.get(v);
      if (maybe === undefined) {
        index.set(v, [r]);
      } else {
        maybe.push(r);
      }
    }
    for (const k of index.keys()) {
      index.set(k, f(index.get(k)));
    }
    return new DataFrame(index, 'map', [this.colNames[cIdx], 'result'], [this.dtypes[cIdx], null]);
  }

  /**
   * @param {string|function(Column, Column, Number): Column} f
   * @param {?DataFrame} [other]
   * @returns {DataFrame} data frame
   */
  connect(f, other = null) {
    if (other === null) {
      return this.connect(f, this);
    }
    if (isString(f)) {
      return this.connect((xs, ys, idx) => xs[f](ys, idx), other);
    }
    const cols = Array(this.cols.length).fill(null);
    const colNames = Array(this.cols.length).fill(null);
    const { nCols } = this;
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      cols[cIdx] = f(this.cols[cIdx], other.cols[cIdx], cIdx);
      if (!isNumber(this.colNames[cIdx])) {
        colNames[cIdx] = this.colNames[cIdx];
      } else if (!isNumber(other.colNames[cIdx])) {
        colNames[cIdx] = other.colNames[cIdx];
      } else {
        colNames[cIdx] = null;
      }
    }
    return new DataFrame(cols, 'cols', colNames);
  }


  /**
   * @param {function(Col, Col): (number|string)} f
   * @param {?boolean} [withNames]
   * @param {?boolean} [isCommutative]
   * @param {*} [identity]
   * @returns {DataFrame} data frame
   */
  matrix(f, withNames = true, isCommutative = false, identity = null, ...args) {
    if (isString(f)) {
      return this.matrix((xs, ys) => xs[f](ys, ...args), withNames, isCommutative, identity);
    }

    const colIdxs = [];
    const rows = [];
    const cache = {};
    const { nCols } = this;
    const msg = (m) => `${this.constructor.name}.matrix() ${m}`;
    const debug = (m) => log.debug(msg(m));

    for (let yIdx = 0; yIdx < nCols; yIdx++) {
      // else
      colIdxs.push(yIdx);
      rows.push([]);

      for (let xIdx = 0; xIdx < nCols; xIdx++) {
        // some ops have a fixed return value when applied to self f(xs, xs) == id
        if (identity !== null && xIdx === yIdx) {
          debug(`[skipping identity yIdx == xIdx, f(${this._colName(xIdx)}, ${this._colName(yIdx)}) = ${identity}`);
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
            debug(`computed and cached f(${this._colName(yIdx)}, ${this._colName(xIdx)})`);
          } else {
            debug(`CACHE HIT for f(${this._colName(yIdx)}, ${this._colName(xIdx)})`);
          }
          rows[rows.length - 1].push(result);
        } else {
          rows[rows.length - 1].push(f(col, other, ...args));
        }
      }
    }

    // numeric col names in the order of appearing in the matrix
    const colNames = this.colNames.filter((_, cIdx) => colIdxs.indexOf(cIdx) >= 0);

    const df = new DataFrame(rows, 'rows', colNames);
    return withNames ? df.prependCol(this.colNames.clone(), 'column') : df;
  }

  /**
   * @param {string[]|number[]|TypedArray} col
   * @param {?String} [name]
   * @param {?DType|'s'} [dtype]
   * @returns {DataFrame} data frame
   */
  appendCol(col, name = null, dtype = null) {
    const cols = [...this.cols];
    const colNames = [...this.colNames];
    const dtypes = [...this.dtypes];
    cols.push(col);
    colNames.push(name === null ? colNames.length : name);
    dtypes.push(dtype === null ? null : dtype);
    return new DataFrame(
      cols,
      'cols',
      colNames,
      dtypes,
    );
  }

  /**
   * @param {string[]|number[]|TypedArray} col
   * @param {?String} [name]
   * @param {?DType|'s'} [dtype]
   * @returns {DataFrame} data frame
   */
  prependCol(col, name = null, dtype = null) {
    const cols = [...this.cols];
    const colNames = [...this.colNames];
    const dtypes = [...this.dtypes];
    cols.unshift(col);
    colNames.unshift(name === null ? colNames.length : name);
    dtypes.unshift(dtype === null ? null : dtype);
    return new DataFrame(
      cols,
      'cols',
      colNames,
      dtypes,
    );
  }

  /**
   * @param {DataFrame} other
   * @param {'col'|'row'|'cols'|'rows'|0|1} [axis]
   * @returns {DataFrame} data frame
   */
  concat(other, axis = 0) {
    if (isNumber(axis)) {
      if (axis < 0) {
        return this.concat(other, axis + 2);
      } else if (axis === 0) {
        return this.connect('concat', other);
      } else if (axis === 1) {
        // else if concat HORIZONTALLY
        const isDigit = /^\d+$/; // check if has proper column names or just indexes
        // if columns are indexes, shift them
        let colNames;
        if (other.colNames.filter((c) => c.toString().search(isDigit)).length === other.colNames.length) {
          colNames = this.colNames.concat(other.colNames.map((cIdx) => this.colNames.length + cIdx));
        } else {
          colNames = this.colNames.concat(other.colNames);
        }

        let renamed;

        /*
         * deal with duplicate col names (add a num to the -- e.g.: Age, Salary, Age2 ...)
         * make sure that name clash didn't arise as a result of previous renaming
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
        return new DataFrame(this.cols.concat(other.cols), 'cols', colNames);
      }
    } else if (isString(axis)) {
      if (axis.search(/^col/i) >= 0) {
        return this.concat(other, 1);
      } else if (axis.search(/^row/i) >= 0) {
        return this.concat(other, 0);
      }
    }
    throw new Error(`${this.constructor.name}.concat() invalid axis argument ${axis}, try 0, 1, 'rows' or 'cols'`);
  }

  /**
   * @param {...number} idxs PAIRS of indexes
   * @returns {DataFrame} a data frame
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
    } else if (idxs.some((idx) => idx < 0)) {
      // resolve negative indexes
      return this.slice(...(idxs.map((idx) => (idx < 0 ? idx + this.length : idx))));
    }

    const { nCols } = this;
    const cols = Array(nCols).fill(0);

    // for every pair of indexes
    for (let i = 1; i < idxs.length; i += 2) {
      const lBound = idxs[i - 1];
      const rBound = idxs[i];
      for (let cIdx = 0; cIdx < nCols; cIdx++) {
        const col = this.cols[cIdx];
        cols[cIdx] = col.subarray(lBound, rBound);
      }
    }

    return new DataFrame(cols, 'cols', [...this.colNames]);
  }

  /**
   * E.g. sliceCols(0)         -> sliceCols(0, end).
   * E.g. sliceCols(0, 10, 20) -> sliceCols(0, 10, 20, end).
   *
   * @param {...(number|string)} slices
   * @returns {DataFrame} data frame
   */
  sliceCols(...slices) {
    const msg = (m) => `${this.constructor.name}.sliceCols() ${m}`;
    if (slices.length === 0) {
      throw new Error(msg('no slice idxs specified (e.g. df.sliceCols(0, -1))'));
    } else if (slices.length % 2 !== 0) {
      // odd number of idxs
      return this.sliceCols(...slices, this.nCols - 1);
    }

    // collect column idxs
    const colIds = new Set();
    const { nCols } = this;

    for (let i = 1; i < slices.length; i += 2) {
      const lBound = this.colIdx(slices[i - 1]);
      let rBound;
      // is num out of bounds
      if (isNumber(slices[i]) && slices[i] >= nCols) {
        log.warn(msg(`upper bound > #cols, you wanted cols up to ${slices[i]}th but there are ${nCols}`));
        rBound = nCols - 1;
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
   * @param {...(number|string|RegExp|function((string|number)): boolean)} params
   * @returns {DataFrame} data frame
   */
  drop(...params) {
    if (params.length === 0) {
      throw new Error('you need to select a column (e.g. df.drop(0, -2, -4))');
    }
    const { colNames } = this.select(...params);
    return this.select((cName) => isString(cName) && colNames.indexOf(cName) < 0);
  }

  /**
   * @param {function((string|number), number): boolean} f
   * @param {?string|number} [colId]
   * @returns {DataFrame} data frame
   */
  filter(f, colId = null) {
    if (colId === null) {
      log.warn(`${this.constructor.name}.filter() no columns specified so running for all`);
      return [...this.colNames].reduce((df, cName) => df.filter(f, cName), this);
    }
    // else focus on one column
    const col = this.col(colId);
    const tests = Array(col.length).fill(false).map((_, rIdx) => f(col[rIdx], rIdx));
    return new DataFrame(
      this.cols.map((c) => c.filter((_, rIdx) => tests[rIdx])),
      'cols',
      [...this.colNames],
      [...this.dtypes],
    );
  }

  /**
   * @param {string|number} val
   * @param {?string|number} colId
   * @param {"not is"|"is"|"lt"|"gt"|"gte"|"lte"|">"|">="|"<"|"<="|"="|"!="|"!=="|"=="|"less than"|"greater than"|"not equal"|"ne"|"equal"|"equals"|"less than or equal"|"greater than or equal"} op
   * @returns {DataFrame} data frame
   */
  where(val, colId = null, op = '=') {
    switch (op.toLowerCase()) {
    case '!=': return this.filter((x) => x !== val, colId);
    case '!==': return this.where(val, colId, '!=');
    case 'ne': return this.where(val, colId, '!=');
    case 'not equal': return this.where(val, colId, '!=');
    case 'not equals': return this.where(val, colId, '!=');

    case 'is': return this.filter((x) => Object.is(x, val), colId);

    case 'not is': return this.filter((x) => !Object.is(x, val), colId);
    case '!is': return this.where(val, colId, 'not is');
    case 'is not': return this.where(val, colId, 'not is');

    case '=': return this.filter((x) => x === val, colId);
    case '==': return this.where(val, colId, '=');
    case 'equal': return this.where(val, colId, '=');
    case 'equals': return this.where(val, colId, '=');

    case '>': return this.filter((x) => x > val, colId);
    case 'gt': return this.where(val, colId, '>');
    case 'greater than': return this.where(val, colId, '>');

    case '<': return this.filter((x) => x < val, colId);
    case 'lt': return this.where(val, colId, '<');
    case 'less than': return this.where(val, colId, '<');

    case '<=': return this.filter((x) => x <= val, colId);
    case 'lte': return this.where(val, colId, '<=');
    case 'less than or equal': return this.where(val, colId, '<=');

    case '>=': return this.filter((x) => x >= val, colId);
    case 'gte': return this.where(val, colId, '>=');
    case 'greater than or equal': return this.where(val, colId, '>=');

    default: throw new Error(`unrecognised op ${op}`);
    }
  }

  /**
   * @param {*} val
   * @param {...*} colIds
   * @returns {DataFrame} data frame without val in colIds
   */
  removeAll(val, ...colIds) {
    if (colIds.length === 0) {
      if (this.nCols === 0) {
        throw new Error(`empty ${this.constructor.name}, no column to perform removeAll on`);
      }
      return this.removeAll(val, ...this.colNames);
    }
    return [...colIds].reduce((df, cName) => df.where(val, cName, 'not is'), this);
  }

  /**
   * @param {?number|?String} [colId]
   * @param {RegExp|string|number} pat
   * @param {string|number} repl
   * @param {...*} args
   * @returns {DataFrame} data frame with f applied to colId
   */
  replace(colId = null, pat, repl, ...args) {
    return this[isNumber(pat) ? 'numeric' : 'nominal'].call(colId, 'replace', pat, repl, ...args);
  }

  /**
   * @param {...(number|string)} colIds
   * @returns {DataFrame} data frame
   */
  removeAllOutliers(...colIds) {
    // by default compute for all (numeric) columns
    if (colIds.length === 0) {
      log.info(`${this.constructor.name}.removeAllOutliers() running for all cols`);
      return this.removeAllOutliers(...this.colNames);
    }

    const cols = [...this.cols];
    const numCols = this.numColIdxs;

    // indexes of *NUMERIC* columns
    const numColIdxs = new Set(colIds.map((id) => this.colIdx(id)).filter((cIdx) => numCols.has(cIdx)));

    // store {Q1, Q3, idx} for every *NUMERIC* column
    const IQRs = this.colNames
    // get column indexes
      .map((_, idx) => idx)
      // and now get all NUMERIC columns while leaving gaps to preserve indexing
      .map((idx) => (numColIdxs.has(idx) ? this.cols[idx] : null))
      // and now computer IQ1 and IQ3 for all NUMERIC columns while leaving gaps to preserve indexing
      .map((maybeCol) => (maybeCol === null ? null : ({ Q1: maybeCol.Q1(), Q3: maybeCol.Q3() })));

    // store results of testing for all rows
    const tests = Array(this.length).fill(true);

    const { nCols } = this;

    // see if this row is an outlier by looking at each numeric column
    for (let rIdx = 0; rIdx < this.length; rIdx++) {
      for (let cIdx = 0; cIdx < nCols; cIdx++) {
        if (numColIdxs.has(cIdx)) {
          const col = cols[cIdx];
          const val = col[rIdx];
          // if value is in Q1 .. Q3 then accept
          if (val < IQRs[cIdx].Q1 || val > IQRs[cIdx].Q3) {
            tests[rIdx] = false;
            break;
          }
        }
      }
    }

    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      // filter every col according to pre-computed boolean vals above
      cols[cIdx] = cols[cIdx].filter((_, rIdx) => tests[rIdx]);
    }

    return new DataFrame(cols, 'cols', [...this.colNames], [...this.dtypes]);
  }

  /**
   * @param {?number|string} [colId]
   * @param {'asc'|'des'|function(string, string): number|function(number, number): number} [ord]
   * @returns {DataFrame}
   */
  sort(colId = null, ord = 'asc') {
    if (colId === null) {
      if (this.nCols === 1) {
        log.warn(`colId not provided but there is only 1 col so sorting on ${this._colName(0)}`);
        return this.sort(0, ord);
      } else {
        throw new Error('you need to select a column (e.g. df.sort(0))');
      }
    }
    if (isFunction(ord)) {
      return new DataFrame([...this].sort(ord), 'rows', [...this.colNames], [...this.dtypes]);
    }
    const cIdx = this.colIdx(colId);
    return this.sort(cIdx, ord.search(/^asc/i) >= 0
      // eslint-disable-next-line no-nested-ternary
      ? (r1, r2) => r1[cIdx] > r2[cIdx] ? 1 : r1[cIdx] < r2[cIdx] ? -1 : 0
      // eslint-disable-next-line no-nested-ternary
      : (r1, r2) => r1[cIdx] > r2[cIdx] ? -1 : r1[cIdx] < r2[cIdx] ? 1 : 0);
  }

  /**
   * Shuffle the data frame.
   *
   * @returns {DataFrame} data frame with shuffle rows
   */
  shuffle() {
    const rIdxs = Array(this.length).fill(0).map((_, idx) => idx);
    const rows = [];
    const rs = this.rows;
    for (let i = 0; i < this.length; i++) {
      const idx = Math.floor(Math.random() * rIdxs.length);
      const rIdx = rIdxs[idx];
      rows.push(rs[rIdx]);
      rIdxs.splice(idx, 1);
    }
    return new DataFrame(rows, 'rows', [...this.colNames], [...this.dtypes]);
  }

  /**
   * @param {?number} [n] number of cols to select
   * @param {string|!function(Column): number} [agg]
   * @param {...*} args
   * @returns {DataFrame} data frame
   */
  nBest(n = null, agg = 'var', ...args) {
    if (n === null) {
      return this.nBest(opts.NBEST, agg);
    }
    if (n > this.nCols) {
      log.warn(`${this.constructor.name}.nBest(n = ${n}), but there is ${this.nCols} cols`);
      return this.nBest(this.nCols, agg);
    }
    return this.agg(agg, ...args)
      .sort(-1, 'des')
      .slice(0, n);
  }

  /**
   * @param {?number} n ratio or number of elements
   * @param {?boolean} wr with replacement
   * @returns {DataFrame} data frame
   */
  sample(n = null, wr = true) {
    if (n === null) {
      return this.sample(opts.SAMPLE_SIZE, wr);
    } else if (n < 1) {
      // tODO optimize DF.sample(n, wr)
      return this.sample(Math.floor(n * this.length));
    } else if (n >= this.length) {
      log.warn(`${this.constructor.name}.sample() sample size ${n} >= nRows ${this.length}`);
      return this.sample(this.length - 1, wr);
    }
    const rows = [];
    const rs = this.rows;
    if (wr) {
      while (rows.length < n) {
        const rIdx = randInt(0, this.length);
        rows.push(rs[rIdx]);
      }
    } else {
      const idxs = Array(this.length).fill(0).map((_, idx) => idx);
      while (rows.length < n) {
        // this is a bit confusing because you are indexing an index
        const i = randInt(0, idxs.length);
        const rowIdx = idxs[i];
        const row = rs[rowIdx];
        rows.push(row);
        idxs.splice(i, 1); // remove i from possible idxs
      }
    }
    return new DataFrame(rows, 'rows', [...this.colNames]);
  }

  /**
   * Produce a count table for values of a column.
   *
   * @param {string|number} colId
   * @returns {DataFrame} data frame of counts
   */
  counts(colId) { return this.groupBy(colId, (xs) => xs.length); }

  /**
   * Produce a ps table for values of a column.
   *
   * @param {string|number} colId
   * @returns {DataFrame} data frame of pss
   */
  ps(colId) { return this.counts(colId).map(-1, (x) => x / this.length); }

  /**
   * One hot encode a column.
   *
   * @param {string|number} colId
   * @returns {DataFrame} one hot encoded table
   */
  oneHot(colId = null) {
    if (colId === null) {
      if (this.nCols === 1) {
        log.info(`${this.constructor.name}.oneHot() colId not specified for counts, executing on the only col`);
        return this.oneHot(0);
      } else {
        throw new Error('you need to select a column (e.g. `df.oneHot(0)`)');
      }
    }
    const col = this.col(colId);
    const k = col.max() + 1;
    const cols = Array(k)
      .fill(0)
      .map(() => Column.empty(col.length, 'u8'));
    for (let rowIdx = 0; rowIdx < col.length; rowIdx++) {
      const val = col[rowIdx];
      cols[val][rowIdx] = 1;
    }
    return new DataFrame(cols, 'cols');
  }

  /**
   * @param {number} [p]
   * @param {?boolean} [withNames]
   * @returns {DataFrame} data frame
   */
  distance(p = 2, withNames = true) {
    return this.numeric.matrix('distance', withNames, true, 0, p);
  }

  /**
   * @param {?boolean} [withNames]
   * @returns {DataFrame} data frame
   */
  dot(withNames = true) {
    return this.numeric.matrix('dot', withNames, true, null);
  }

  /**
   * @param {?boolean} [withNames]
   * @returns {DataFrame} data frame
   */
  cov(withNames = true) {
    return this.numeric.matrix('cov', withNames, true, null);
  }

  /**
   * @param {?boolean} [withNames]
   * @returns {DataFrame} data frame
   */
  corr(withNames = true) {
    return this.numeric.matrix('corr', withNames, true, 1);
  }

  /**
   * Summaries each column.
   *
   * @returns {DataFrame} data frame
   */
  summary() {
    if (this.numColIdxs.size !== this.cols.length) {
      log.info('omitting str columns from summary');
      return this.numeric.summary();
    }

    const { dtypes, nCols } = this;

    const info = {
      column: Column.empty(nCols, 's'),
      dtype: Column.empty(nCols, 's'),
      min: Column.empty(nCols),
      max: Column.empty(nCols),
      range: Column.empty(nCols),
      mean: Column.empty(nCols, 'f64'),
      stdev: Column.empty(nCols, 'f64'),
    };

    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      info.column[cIdx] = this.colNames[cIdx];
      info.dtype[cIdx] = dtypes[cIdx];
      const col = this.cols[cIdx];
      info.min[cIdx] = col.min();
      info.max[cIdx] = col.max();
      info.range[cIdx] = info.max[cIdx] - info.min[cIdx];
      info.mean[cIdx] = col.mean();
      info.stdev[cIdx] = col.stdev();
    }
    return new DataFrame(info);
  }

  /**
   * @returns {DataFrame} shallow copy of the data frame
   */
  copy() {
    return new DataFrame([...this.cols], 'cols', [...this.colNames], [...this.dtypes]);
  }

  /**
   * @returns {DataFrame} clone (deep copy) of the data frame
   */
  clone() {
    const { nCols } = this;
    const newCols = Array(nCols).fill(0);
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      const col = this.cols[cIdx];
      newCols[cIdx] = col.clone();
    }
    return new DataFrame(newCols, 'cols', [...this.colNames], [...this.dtypes]);
  }

  /**
   * @param {?string} [fileName]
   * @returns {Object<number[]|string[]>|undefined} dictionary
   */
  toObj(fileName = null) {
    if (fileName !== null) {
      log.info(`writing Object to "${fileName}"`);
      writeFileSync(fileName, JSON.stringify(this.toObj()), { encoding: 'utf-8', flag: 'w' });
      return undefined;
    }
    const dict = {};
    const { nCols } = this;
    for (let cIdx = 0; cIdx < nCols; cIdx++) {
      const cName = this.colNames[cIdx];
      const col = this.cols[cIdx];
      dict[cName] = [...col];
    }
    return dict;
  }

  /**
   * @param {?string} fileName
   * @returns {string|undefined}
   */
  toJSON(fileName = null) {
    if (fileName !== null) {
      log.info(`writing JSON to "${fileName}"`);
      writeFileSync(fileName, this.toJSON(), { encoding: 'utf-8', flag: 'w' });
      return undefined;
    }
    return JSON.stringify(this.toObj());
  }

  /**
   * @param {?string} [fileName]
   * @returns {string|undefined}
   */
  toCSV(fileName = null) {
    if (fileName !== null) {
      log.info(`writing CSV to "${fileName}"`);
      writeFileSync(fileName, this.toCSV(), { encoding: 'utf-8', flag: 'w' });
      return undefined;
    }
    const stringify = require('csv-stringify/lib/sync');
    const a = [...this];
    a.unshift(this.colNames);
    return stringify(a);
  }

  /**
   * @param {string} tableName
   * @returns {string}
   */
  toSQLTableDef(tableName = 'Table') {
    const dtypeMap = {
      f32: 'REAL',
      f64: 'REAL',
      i8: 'INT',
      i16: 'INT',
      i32: 'INT',
      u8: 'INT',
      u16: 'INT',
      u32: 'INT',
      s: 'TEXT',
    };
    return `
CREATE TABLE IF NOT EXISTS ${tableName} (
  ${this.colNames.some((col) => col.toLowerCase() === 'id') ? '' : `id int NOT NULL AUTO_INCREMENT,`}
  ${this.colNames.map((cName, cIdx) => `${cName} ${dtypeMap[this.dtypes[cIdx]]}`).join(',\n  ')}
) `.trim();
  }

  /**
   * @param {string} tableName
   * @returns {string}
   */
  toSQLInserts(tableName = 'Table') {
    const { rows } = this;
    const xs = Array(this.length);
    for (let i = 0; i < this.length; i++) {
      xs[i] = rows[i];
    }
    return xs.map((row) => `INSERT INTO ${tableName} (${this.colNames.join(', ')}) VALUES (${row.map((val) => val.toString()).join(', ')})`).join(';\n');
  }

  /**
   * @param {string} tableName
   * @returns {string}
   */
  toSQLUpdates(tableName = 'Table') {
    const { rows } = this;
    const xs = Array(this.length);
    for (let i = 0; i < this.length; i++) {
      xs[i] = rows[i];
    }
    return xs.map((row) => `UPDATE ${tableName} SET ${row.map((val, cIdx) => `${this.colNames[cIdx]} = ${val.toString()}`).join(', ')}`).join(';\n');
  }

  /**
   * @param {?string} [fileName]
   * @returns {string|undefined} HTML
   */
  toHTML(fileName = null) {
    if (fileName !== null) {
      log.info(`writing HTML to ${fileName}`);
      writeFileSync(fileName, this.toHTML(), { encoding: 'utf-8', flag: 'w' });
      return undefined;
    }
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

      const { rows } = this;
      for (const val of rows[rIdx]) {
        chunks.push(`<td>${val.toString()}</td>`);
      }

      chunks.push('</tr>');
    }

    chunks.push('</table>');
    return chunks.join('');
  }

  /**
   * @returns {string[]} datasets
   */
  static get dataSets() {
    const filters = [(path) => path.search(/\.(csv|json)$/i) >= 0];
    const nodeStack = [...opts.DATASETS];
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
        if (filters.reduce((ok, f) => ok || f(path), false)) {
          datasets.add(path);
        }
      }
      i++;
    }
    return [...datasets];
  }

  /**
   * @returns {Record<string,*>}
   */
  static get opts() { return opts; }

  /**
   * @param {?number} [n]
   * @param {?number} [m]
   * @param {function(string): void} sink
   */
  print(n = null, m = null, sink = console.log) { sink(this.toString(n, m)); }

  /**
   * @param {string} opt
   */
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
   * @param {number} [n]
   * @param {number} [m]
   * @returns {string} string representation of the data frame
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
      log.warn(`${this.constructor.name}.toString(n = ${n}), but there is ${this.length} rows`);
      return this.toString(this.length - n, this.length);
    } else if (m > this.length) {
      log.warn(`${this.constructor.name}.toString(m = ${m}), but there is ${this.length} rows`);
      return this.toString(Math.max(0, this.length - (m - n)), this.length);
    } else if (this.nCols === 0) {
      return opts.EMPTY_STR;
    }

    const { dtypes } = this;

    // always has the actual number of columns INCLUDING the optional index
    const nCols = this.nCols + (opts.SHOW_INDEX ? 1 : 0);
    let colWidth = opts.MIN_COL_WIDTH;

    // e.g. for 3 cols you have 2 * SPACE_BETWEEN so always subtract a single SPACE_BETWEEN
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
        h = `${opts.PAD_STR.repeat(dtypes[cIdx].length)} ${h.toString()}`;
      } else {
        // no padding needed
        h = h.toString();
      }
      headerRow.push(h);
    }

    rows.push(headerRow);

    /*
     * info about not displayed rows
     * .. ... (2 more) .. .. <- THIS
     * 3
     * 4
     * 5
     */
    if (opts.SHOW_MORE && n > 0 && this.nCols > 0) {
      const arr = Array(nCols).fill(opts.DOTS);
      arr[0] = `(${n} more)`;
      rows.push(arr);
    }

    // memoize
    const numCols = this.numColIdxs;

    /*
     * now the actual content of the table
     * remember about optional index (inject AFTER)!
     */
    for (let rIdx = n; rIdx < m; rIdx++) {
      // initialise
      const row = Array(this.nCols).fill('');

      const rs = this.rows;
      for (let cIdx = 0; cIdx < this.nCols; cIdx++) {
        const val = rs[rIdx][cIdx];
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

      /*
       * different memory indicator for index
       *(doesn't actually take any memory since it's just printed)
       */
      if (opts.SHOW_INDEX) {
        memInfo.unshift(opts.MEM_INFO_INDEX);
      }

      rows.push(memInfo);
    }

    // lengths of each column
    const colWidths = Array(nCols)
      .fill(0)
      .map((_, cIdx) => rows
        .map((r) => r[cIdx].toString().length)
        .reduce((len1, len2) => Math.max(len1, len2), 1));

    // inject underline AFTER col headings
    rows.splice(1, 0, colWidths.map((l) => opts.UNDERLINE.repeat(l)));
    // same for bottom but optional, the row before memory info (IF PRESENT)
    if (opts.UNDERLINE_BOT) {
      if (opts.MEM_INFO) {
        rows.splice(rows.length - 1, 0, colWidths.map((l) => opts.UNDERLINE.repeat(l)));
      } else {
        rows.splice(rows.length, 0, colWidths.map((l) => opts.UNDERLINE.repeat(l)));
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
      /*
       * remove cols in the middle
       *this ensures that there is n - 1 SPACE_BETWEEN for every n cols
       */
      const nColsToShow = Math.floor((termWidth + opts.SPACE_BETWEEN) / (colWidth + opts.SPACE_BETWEEN));

      /*
       * C C C LEFT C C C RIGHT C C C
       * should remove Cs on the left of LEFT and on the right of RIGHT
       *C C C ... C C C
       */
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
        rows[rIdx] = rows[rIdx].map((val, cIdx) => val.padStart(colWidths[cIdx], opts.PAD_STR))
          .join(opts.PAD_STR.repeat(opts.SPACE_BETWEEN));
      }
    }
    return rows.join('\n');
  }

  [util.inspect.custom](depth, options) { return this.toString(); }
}

module.exports = DataFrame;
