/* eslint-disable sort-keys,no-param-reassign */
const util = require('util');

const { randInRange, randInt } = require('./rand');
const { dtypeRegex, isNumRegex, fmtFloat } = require('./utils');
const log = require('./log');
const opts = require('./opts');

/**
 * @typedef {'i8'|'i16'|'i32'|'u8'|'u16'|'u32'|'f32'|'f64'} DType
 * @typedef {Uint8Array|Uint8ClampedArray|Uint16Array|Uint32Array|Int8Array|Int16Array|Int32Array|Float32Array|Float64Array} TypedArray
 */

/**
 * @typedef  {ArrayLike} Col
 * @property {'s'|DType} dtype
 * @property {!Boolean}  isEmpty
 * @property {!Boolean}  randEl
 * @property {!Function} all
 * @property {!Function} argMax
 * @property {!Function} argMin
 * @property {!Function} contains
 * @property {!Function} convert
 * @property {!Function} counts
 * @property {!Function} cum
 * @property {!Function} filter
 * @property {!Function} map
 * @property {!Function} mode
 * @property {!Function} none
 * @property {!Function} print
 * @property {!Function} ps
 * @property {!Function} clone
 * @property {!Function} reduce
 * @property {!Function} removeAll
 * @property {!Function} unique
 * @property {!Function} reverse
 * @property {!Function} shuffle
 * @property {!Function} slice
 * @property {!Function} sort
 * @property {!Function} swap
 * @property {!Function} takeWhile
 * @property {!Function} toString
 */

/**
 * @typedef  {Col}       ColStr
 * @property {'s'}       dtype
 * @property {!Function} concat
 * @property {!Function} filter
 * @property {!Function} head
 * @property {!Function} labelEncode
 * @property {!Function} pop
 * @property {!Function} replace
 * @property {!Function} sample
 * @property {!Function} subarray
 * @property {!Function} tail
 * @property {!Function} zipWith
 * @property {!Function} zipWith3
 */

/**
 * @typedef  {Col}     ColNum
 * @property {!DType}  dtype
 * @property {!Number} BYTES_PER_ELEMENT
 * @property {!Function} IQR
 * @property {!Function} Q1
 * @property {!Function} Q3
 * @property {!Function} abs
 * @property {!Function} add
 * @property {!Function} cbrt
 * @property {!Function} ceil
 * @property {!Function} clip
 * @property {!Function} concat
 * @property {!Function} corr
 * @property {!Function} cov
 * @property {!Function} cube
 * @property {!Function} disDiff
 * @property {!Function} dist
 * @property {!Function} div
 * @property {!Function} dot
 * @property {!Function} downcast
 * @property {!Function} filter
 * @property {!Function} floor
 * @property {!Function} head
 * @property {!Function} kBins
 * @property {!Function} kurtosis
 * @property {!Function} mad
 * @property {!Function} map
 * @property {!Function} max
 * @property {!Function} mean
 * @property {!Function} median
 * @property {!Function} memory
 * @property {!Function} min
 * @property {!Function} mul
 * @property {!Function} nLargest
 * @property {!Function} nQuart
 * @property {!Function} nSmallest
 * @property {!Function} normalize
 * @property {!Function} pop
 * @property {!Function} pow
 * @property {!Function} removeAllOutliers
 * @property {!Function} replace
 * @property {!Function} root
 * @property {!Function} round
 * @property {!Function} sample
 * @property {!Function} skewness
 * @property {!Function} smooth
 * @property {!Function} sqrt
 * @property {!Function} square
 * @property {!Function} stdev
 * @property {!Function} sub
 * @property {!Function} subarray
 * @property {!Function} tail
 * @property {!Function} takeWhile
 * @property {!Function} trunc
 * @property {!Function} var
 * @property {!Function} zipWith
 * @property {!Function} zipWith3
 */

/**
 *
 * @param {!Object} o
 * @param {!String} name
 * @param {!Function} f
 * @private
 */
const defineGetter = (o, name, f) => {
  Object.defineProperty(o, name, { get: f, configurable: true });
};

const COL_PROTO = {

  // printing

  /**
   * @param {!Number|null} [len]
   * @returns {!String}
   */
  toString(len = null) {
    if (len === null) {
      return this.toString(opts.HEAD_LEN);
    } else if (len > this.length) {
      log.warn(`len = ${len}, but there is ${this.length} items`);
    }
    const parts = [`Col${this.dtype === undefined ? '' : this.dtype[0].toUpperCase()}${this.dtype.slice(1)} [`];
    const n = Math.min(len, this.length);
    for (let i = 0; i < n; i++) {
      const val = this[i];
      const s = val.toString();
      const isStr = val.constructor.name[0] === 'S';
      const isNum = !isStr && val.constructor.name[0] === 'N';
      const isFloat = isNum && s.match(/\./);
      parts.push(isFloat ? fmtFloat(val) : s);
    }
    if (n < this.length) {
      parts.push(`... ${this.length - n} more`);
    }
    return `${parts[0] + parts.slice(1).join(', ')}]`;
  },

  /**
   * @param {!Number|null} [n]
   */
  print(n = null) {
    if (n === null) {
      this.print(opts.HEAD_LEN);
      return;
    }
    console.log(this.toString(n));
  },

  /**
   * @param {Number} depth
   * @param {Object} options
   * @returns {!String}
   */
  [util.inspect.custom](depth, options) {
    return this.toString(opts.HEAD_LEN);
  },

  // cumulative operations

  /**
   * @param {!Function} f
   * @param {!DType|null} [dtype]
   * @returns {ColNum|ColStr}
   */
  cum(f, dtype = null) {
    if (f === undefined) {
      throw new Error('you need to provide a function name / function e.g. "add"');
    } else if (this.length === 0) {
      return this;
    } else if (dtype === null) {
      return this.cum(f, this.dtype);
    } else if (f.constructor.name[0] === 'S' && this[f] === undefined) {
      throw new Error(`there is no callable funct ${f} on ${this.toString()}`);
    }
    let newArr;
    if (dtype === 's') {
      newArr = Array(this.length).fill(0);
    } else {
      newArr = empty(this.length, dtype);
    }
    newArr[0] = this[0];
    if (this.length === 1) {
      return newArr;
    }
    // function name (string)
    if (f.constructor.name[0] === 'S') {
      for (let i = this.length - 1; i > 0; i--) {
        newArr[i] = this.subarray(0, i + 1)[f]();
      }
    } else {
      for (let i = this.length - 1; i > 0; i--) {
        newArr[i] = f(this.subarray(0, i + 1));
      }
    }
    return newArr;
  },

  // other

  /**
   * @param {!Function} f
   * @returns {!ColNum|!ColStr}
   */
  takeWhile(f) {
    let i = 0;
    while (f(this[i]) && i < this.length) i++;
    return this.slice(0, i);
  },

  /**
   * @returns {!Map<*,Number>}
   */
  counts() { return bag(this); },

  /**
   * @returns {!Map<*,Number>}
   */
  ps() {
    const b = this.counts();
    let total = 0;
    for (const k of b.keys()) {
      total += b.get(k);
    }
    const ps = new Map();
    for (const k of b.keys()) {
      ps.set(k, b.get(k) / total);
    }
    return ps;
  },

  /**
   * @param {!Function} f
   * @returns {*}
   */
  argMax(f) {
    let best = this[0];
    let bestScore = f(best);
    for (let i = 1; i < this.length; i++) {
      const x = this[i];
      const score = f(x);
      if (score > bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  },

  /**
   * @param {!Function} f
   * @returns {*}
   */
  argMin(f) {
    let best = this[0];
    let bestScore = f(best);
    for (let i = 1; i < this.length; i++) {
      const x = this[i];
      const score = f(x);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  },

  // pre-processing

  // boolean

  /**
   * @param {!Function} f
   * @returns {!Boolean}
   */
  all(f) {
    return !this.some((v, idx, arr) => !f(v, idx, arr));
  },

  /**
   * @param {!Function} f
   * @returns {!Boolean}
   */
  none(f) {
    return !this.some((v, idx, arr) => f(v, idx, arr));
  },

  /**
   * @param {*} v
   * @returns {!Boolean}
   */
  contains(v) {
    return this.some(x => x === v);
  },

  // manipulation

  /**
   * @param {!DType|null} [dtype]
   * @returns {ColStr|ColNum}
   */
  reverse(dtype = null) {
    return this.clone(dtype)._reverse();
  },

  /**
   * @param {*} v
   * @returns {!ColNum|!ColStr}
   */
  removeAll(v) {
    return this.filter(a => !Object.is(a, v));
  },

  /**
   * @param {!Number} i
   * @param {!Number} j
   * @returns {ColStr|ColNum}
   */
  swap(i, j) {
    const save = this[i];
    this[i] = this[j];
    this[j] = save;
    return this;
  },

  /**
   * @param {'asc'|'des'|!Function} [order]
   * @param {!DType|null} [dtype]
   * @returns {ColNum|ColStr}
   */
  sort(order = 'asc', dtype = null) {
    if (order === 'asc') {
      return this.clone(dtype)._sort((a, b) => a > b ? 1 : a < b ? -1 : 0);
    } else if (order === 'des') {
      return this.clone(dtype)._sort((a, b) => a > b ? -1 : a < b ? 1 : 0);
    } else {
      return this.clone(dtype)._sort(order);
    }
  },

  /**
   * @returns {ColNum|ColStr}
   * @private
   */
  _shuffle() {
    for (let i = this.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {ColStr|ColNum}
   */
  shuffle(dtype = null) {
    return this.clone(dtype)._shuffle();
  },

  /**
   * @returns {!Number|!String|undefined}
   */
  mode() {
    if (this.length === 1) return this[0];
    const counts = Array.from(bag(this)
      .entries())
      .map(([s, count]) => [s, count]);

    if (counts.length === 1) {
      return counts[0][0];
    }

    return counts.reduce(([val1, count1], [val2, count2]) => count2 > count1
      ? [val2, count2]
      : [val1, count1])[0];
  },
};

/**
 * @param {!Array<!String>|!TypedArray|!ColStr|!ColNum} a
 * @private
 */
const enh = function (a) {
  // already enhanced
  if (a.dtype !== undefined) {
    return;
  }

  // hacks necessary to ensure immutability
  a._sort = a.sort;
  a._reverse = a.reverse;

  defineGetter(a, 'randEl', function randEl() {
    return this[Math.floor(randInRange(0, this.length))];
  });

  defineGetter(a, 'isEmpty', function isEmpty() {
    return this.length === 0;
  });

  Object.assign(a, COL_PROTO);
};

const COL_STR_PROTO = {

  // memory & data type

  dtype: 's',

  /**
   * @returns {!ColStr}
   */
  clone() {
    const xs = Array.from(this);
    enh(xs);
    enhStrArr(xs);
    return xs;
  },

  // pre-processing

  /**
   * @param {!RegExp|!String} pat
   * @param {!String} y
   * @returns {!ColStr}
   */
  replace(pat, y) {
    return this.map(x => x.replace(pat, y));
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  labelEncode(dtype = null) {
    if (dtype === null) {
      return this.labelEncode('u8');
    }
    const newArr = empty(this.length, dtype);
    const map = new Map();
    let label = 0;
    for (let i = 0; i < this.length; i++) {
      const val = this[i];
      const maybe = map.get(val);
      if (maybe === undefined) {
        map.set(val, label);
        newArr[i] = label;
        label++;
      } else {
        newArr[i] = maybe;
      }
    }
    newArr.labelMap = map;
    return newArr;
  },

  /**
   * @returns {!ColStr}
   */
  unique() {
    return from(Array.from(new Set(this)));
  },

  // basic stats

  /**
   * @param {!Number} n
   * @param {!Boolean} [wr]
   * @returns {!ColStr}
   */
  sample(n, wr = true) {
    if (n === null) {
      return this.sample(this.length, wr);
    }
    if (n < 1) {
      return this.sample(Math.floor(this.length * n), wr);
    }
    if (wr) {
      return from(Array(n).fill(0).map(() => this[randInt(0, this.length)]));
    }
    const sample = Array(n).fill(0);
    const used = new Set();
    for (let ptr = 0; ptr < n; ptr++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * this.length);
      } while (used.has(idx));
      sample[ptr] = this[idx];
      used.add(idx);
    }
    return from(sample);
  },

  // manipulation, views and slices

  /**
   * @param {!Number} idx
   * @returns {!ColStr}
   */
  pop(idx) {
    const clone = this.clone();
    clone.splice(idx, 1);
    return clone;
  },

  /**
   * @param {!Number|null} [n]
   * @returns {!ColStr}
   */
  head(n = null) {
    if (n === null) {
      return this.head(opts.HEAD_LEN);
    }
    return this.slice(0, n);
  },

  /**
   * @param {!Number|null} [n]
   * @returns {!ColStr}
   */
  tail(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.slice(this.length - n);
  },

  // functional programming

  /**
   * @param {Iterable} other
   * @param {Function} f
   * @returns {!ColNum|!ColStr}
   */
  zipWith(other, f) {
    return from(Array(this.length.fill(0).map((_, idx) => f(this[idx], other[idx]))));
  },

  /**
   * @param {Iterable} xs
   * @param {Iterable} ys
   * @param {Function} f
   * @returns {!ColNum|!ColStr}
   */
  zipWith3(xs, ys, f) {
    return from(Array(this.length.fill(0).map((_, idx) => f(this[idx], xs[idx], ys[idx]))));
  },


  // hacks

  /**
   * @param {!ColStr} other
   * @returns {!ColStr}
   */
  concat(other) {
    const xs = this._concat(other);
    enh(xs);
    enhStrArr(xs);
    return xs;
  },

  /**
   * @param {!Number} n
   * @param {!Number} m
   * @returns {!ColStr}
   */
  slice(n, m) {
    const xs = this._slice(n, m);
    enh(xs);
    enhStrArr(xs);
    return xs;
  },

  /**
   * @param {Function} f
   * @param {!DType|null} [dtype]
   * @returns {!ColStr}
   */
  map(f, dtype = null) {
    const xs = this._map(f);
    enh(xs);
    enhStrArr(xs);
    return xs;
  },

  /**
   * @param {Function} f
   * @returns {!ColStr}
   */
  filter(f) {
    const xs = this._filter(f);
    enh(xs);
    enhStrArr(xs);
    return xs;
  },
};

/**
 * @param {!Array<!String>|!ColStr} a
 * @private
 */
const enhStrArr = (a) => {
  // already enhanced
  if (a.dtype !== 's') {
    return;
  }

  // hacks necessary to ensure immutability

  a._concat = a.concat;
  a._slice = a.slice;
  // consistency of API so that I can call subarray on both
  a.subarray = a.slice;

  a._map = a.map;
  a._filter = a.filter;

  Object.assign(a, COL_STR_PROTO);
};

const COL_NUM_PROTO = {

  /**
   * @param {!DType|null} [dtype]
   * @returns {ColNum}
   */
  convert(dtype = null) {
    return dtype === this.dtype
      ? this
      : from(this, dtype, false);
  },

  /**
   * @returns {!Number}
   */
  memory() {
    return this.BYTES_PER_ELEMENT * this.length;
  },

  /**
   * @param {!DType} toDtype
   * @returns {!ColNum}
   */
  cast(toDtype) {
    if (toDtype === this.dtype) {
      return this;
    }
    const newArr = empty(this.length, toDtype);
    newArr.set(this);
    return newArr;
  },

  /**
   * @returns {!ColNum}
   */
  downcast() {
    const guess = guessNumDtype(this);
    if (guess === this.dtype) {
      return this;
    }
    const newArr = empty(this.length, guess);
    newArr.set(this);
    return newArr;
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum|!ColStr}
   */
  clone(dtype = null) {
    const newArr = empty(this.length, dtype === null ? this.dtype : dtype);
    newArr.set(this);
    return newArr;
  },

  // manipulation, views and slices

  /**
   * @param {!Number|null} [n]
   * @returns {!ColNum}
   */
  head(n = null) {
    if (n === null) {
      return this.head(opts.HEAD_LEN);
    }
    return this.subarray(0, n);
  },

  /**
   * @param {!Number|null} [n]
   * @returns {!ColNum}
   */
  tail(n = null) {
    if (n === null) {
      return this.tail(opts.HEAD_LEN);
    }
    return this.subarray(this.length - n);
  },

  /**
   * @returns {!ColNum}
   */
  unique() {
    const s = new Set(this);
    const newArr = empty(s.size, this.dtype);
    let i = 0;
    for (const x of s) {
      newArr[i] = x;
      i++;
    }
    return newArr;
  },


  /**
   * @param {ColNum} other
   * @returns {!ColNum}
   */
  concat(other) {
    let dtype = `f${opts.FLOAT_PREC}`;
    if (this.dtype[0] === other.dtype[0]) {
      dtype = this.BYTES_PER_ELEMENT >= other.BYTES_PER_ELEMENT ? this.dtype : other.dtype;
    } else if (other.dtype.startsWith('u') && this.dtype.startsWith('i')
      || this.dtype.startsWith('u') && other.dtype.startsWith('i')) {
      dtype = 'i32';
    } else if (other.dtype.startsWith('f')) {
      dtype = other.dtype;
    } else if (this.dtype.startsWith('f')) {
      dtype = this.dtype;
    }
    const newArr = empty(this.length + other.length, dtype);
    newArr.set(this);
    newArr.set(other, this.length);
    return newArr;
  },

  /**
   * @param {!Number|null} [n]
   * @returns {!ColNum}
   */
  nLargest(n = null) {
    if (n === null) {
      return this.nLargest(opts.HEAD_LEN);
    }
    return this.sort('des').subarray(0, n);
  },

  /**
   * @param {!Number|null} [n]
   * @returns {!ColNum}
   */
  nSmallest(n = null) {
    if (n === null) {
      return this.nSmallest(opts.HEAD_LEN);
    }
    return this.sort('asc').subarray(0, n);
  },

  /**
   * @param {!Number} idx
   * @returns {!Number}
   */
  pop(idx) {
    const newArr = empty(this.length - 1, this.dtype);
    newArr.set(this.subarray(0, idx));
    newArr.set(this.subarray(idx + 1), idx);
    return newArr;
  },

  // arithmetic

  /**
   * @param {!Number|!ColNum|null} [other]
   * @param {!DType|null} [dtype]
   * @returns {!ColNum|!Number}
   */
  add(other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x + y, 0);
    }
    const myDtype = this.dtype;
    const amInt = myDtype[0] === 'i';
    const amUint = myDtype[0] === 'u';
    const amFloat = myDtype[0] === 'f';
    const myBits = this.BYTES_PER_ELEMENT * 8;

    // is number
    if (other.constructor.name[0] === 'N') {
      if (dtype !== null) {
        return empty(this.length, dtype).map(x => x + other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || isInt && (!isNeg || amInt)) {
        return this.map(x => x + other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, 'i32').map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype).map((_, idx) => this[idx] * other[idx]);
    }

    // tried to call typearr.add([1, 2, 3]) with regular arr
    if (Array.isArray(other)) {
      return this.add(from(other));
    }

    const otherDtype = other.dtype;

    // if other is an EnhancedTypedArray
    const isFloat = otherDtype[0] === 'f';
    const isInt = otherDtype[0] === 'i';
    const isUint = otherDtype[0] === 'u';
    const otherBits = other.BYTES_PER_ELEMENT * 8;
    const len = Math.min(this.length, other.length);

    if (isFloat && amFloat || isUint && amUint || isInt && amInt) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return this.map((x, idx) => x + other[idx]);
      }
    } else if (amFloat) {
      return this.map((x, idx) => x + other[idx]);
    } else if (isFloat) {
      return other.map((x, idx) => x + this[idx]);
    } else if (amInt && isUint) {
      if (myBits >= otherBits * 2) {
        return this.map((x, idx) => x + other[idx]);
      } else {
        return empty(len, 'i32').map((_, idx) => this[idx] + other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= myBits * 2) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`).map((_, idx) => this[idx] + other[idx]);
      }
    }
    return empty(len, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] * other[idx]);
  },

  /**
   * @param {!Number|!ColNum|null} [other]
   * @param {!DType|null} [dtype]
   * @returns {!ColNum|!Number}
   */
  sub(other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x - y);
    }

    // is array, elemnt-wise op
    if (other.constructor.name[0] !== 'N') {
      // tODO fix inefficient a.sub
      return this.add(other.mul(-1, dtype), dtype);
    }

    // is number (so subtract other for all elements)

    if (this.dtype[0] === 'f') {
      return this.map(x => x - other);
    }

    // am int and is int (but could be signed)
    if (Number.isInteger(other)) {
      const bits = this.BYTES_PER_ELEMENT * 8;
      const worstCase1 = 2 ** bits - other;
      const worstCase2 = 2 ** bits + other;
      const worstCase3 = -(2 ** bits) + other;
      const worstCase4 = -(2 ** bits) - other;
      const scenarios = [
        worstCase1, worstCase2, worstCase3, worstCase4,
      ];
      return empty(this.length, guessNumDtype(scenarios)).map((_, idx) => this[idx] - other);
    }

    return empty(this.length, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] - other);
  },

  /**
   * @param {!Number|!ColNum|null} [other]
   * @param {!DType|null} [dtype]
   * @returns {!ColNum|!Number}
   */
  mul(other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x * y, 1);
    }
    const myDtype = this.dtype;
    const amInt = myDtype.match('i');
    const amUint = myDtype.match('u');
    const amFloat = myDtype.match('f');
    const myBits = this.BYTES_PER_ELEMENT * 8;

    // is number
    if (other.constructor.name[0] === 'N') {
      if (dtype !== null) {
        return empty(this.length, dtype)
          .map(x => x * other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || isInt && (!isNeg || amInt)) {
        return this.map(x => x * other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, `i32`).map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype)
        .map((_, idx) => this[idx] * other[idx]);
    }

    if (Array.isArray(other)) {
      return this.mul(from(other));
    }

    // if other is an EnhancedTypedArray
    const isFloat = other.dtype.match('f');
    const isInt = other.dtype.match('i');
    const isUint = other.dtype.match('u');
    const otherBits = other.BYTES_PER_ELEMENT * 8;
    const len = Math.min(this.length, other.length);

    if (isFloat && amFloat) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return this.map((x, idx) => x * other[idx]);
      }
    } else if (amFloat) {
      return this.map((x, idx) => x * other[idx]);
    } else if (isFloat) {
      return other.map((x, idx) => x * this[idx]);
    } else if (amUint && isUint) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return this.map((x, idx) => x * other[idx]);
      }
    } else if (amInt && isUint) {
      if (myBits >= otherBits * 2) {
        return this.map((x, idx) => x * other[idx]);
      } else {
        return empty(len, 'i32').map((_, idx) => this[idx] * other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= myBits * 2) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`).map((_, idx) => this[idx] * other[idx]);
      }
    }
    return empty(len, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] * other[idx]);
  },

  /**
   * @param {!Number|!ColNum|null} [other]
   * @param {!DType|null} [dtype]
   * @returns {!ColNum|!Number}
   */
  div(other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x / y);
    }
    const myDtype = this.dtype;
    const amFloat = myDtype.match('f');

    // is num
    if (other.constructor.name[0] === 'N') {
      if (dtype !== null) {
        return empty(this.length, dtype)
          .map(x => x / other);
      }
      return empty(this.length, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] / other);
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype)
        .map((_, idx) => this[idx] / other[idx]);
    }

    if (Array.isArray(other)) {
      return this.div(from(other));
    }

    // if other is an EnhancedTypedArray
    const isFloat = other.dtype.match('f');
    const len = Math.min(this.length, other.length);

    if (isFloat && amFloat) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x / this[idx]);
      } else {
        return this.map((x, idx) => x / other[idx]);
      }
    } else if (amFloat) {
      return this.map((x, idx) => x / other[idx]);
    } else if (isFloat) {
      return other.map((x, idx) => x / this[idx]);
    }
    return empty(len, `f${opts.FLOAT_PREC}`).map((_, idx) => this[idx] / other[idx]);
  },

  /**
   * @param {!Number} n
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  root(n, dtype = null) {
    return this.pow(1 / n, dtype);
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  sqrt(dtype = null) {
    if (dtype === null || dtype === this.dtype) {
      return this.map(x => Math.sqrt(x));
    } else {
      return empty(this.length, dtype).map(x => Math.sqrt(x));
    }
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  cbrt(dtype = null) {
    if (dtype === null || dtype === this.dtype) {
      return this.map(x => Math.cbrt(x));
    } else {
      return empty(this.length, dtype).map(x => Math.cbrt(x));
    }
  },

  /**
   * @param {!Number} n
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  pow(n, dtype = null) {
    if (n === 0) {
      return ones(this.length, dtype);
    } else if (n === 1) {
      return this.clone(dtype);
    } else if (dtype === null || this.dtype === dtype) {
      return this.map(x => x ** n);
    } else {
      return empty(this.length, dtype).map((_, idx) => this[idx] ** n);
    }
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  cube(dtype = null) {
    return this.pow(3, dtype);
  },

  /**
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  square(dtype = null) {
    return this.pow(2, dtype);
  },

  // basic math ops

  /**
   * @returns {!ColNum}
   */
  abs() {
    const { dtype } = this;
    if (dtype.startsWith('i')) {
      return this.cast(`u${Math.min(32, this.BYTES_PER_ELEMENT * 8 * 2)}`);
    } else {
      return this.map(x => Math.abs(x));
    }
  },

  /**
   * @returns {!ColNum}
   */
  trunc() {
    log.info('you might want to downcast now to save memory');
    return this.map(x => Math.trunc(x));
  },

  /**
   * @returns {!ColNum}
   */
  ceil() {
    log.info('you might want to downcast now to save memory');
    return this.map(x => Math.ceil(x));
  },

  /**
   * @returns {!ColNum}
   */
  round() {
    log.info('you might want to downcast now to save memory');
    return this.map(x => Math.round(x));
  },

  /**
   * @returns {!ColNum}
   */
  floor() {
    log.info('you might want to downcast now to save memory');
    return this.map(x => Math.floor(x));
  },

  // basic stats

  /**
   * @returns {!Number|undefined}
   */
  max() {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.max(v1, v2));
  },

  /**
   * @returns {!Number|undefined}
   */
  min() {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.min(v1, v2));
  },

  /**
   * @returns {!Number|undefined}
   */
  skewness() {
    const xs = this.cast(`f${opts.FLOAT_PREC}`);
    return xs.sub(this.mean())
      .cube()
      .mean() / xs.var() ** (3 / 2);
  },

  /**
   * @param {!ColNum} other
   * @returns {!Number}
   */
  corr(other) {
    const muDiffX = this.cast(`f${opts.FLOAT_PREC}`).sub(this.mean());
    const muDiffY = other.cast(`f${opts.FLOAT_PREC}`).sub(other.mean());
    return muDiffX.mul(muDiffY).add() / (Math.sqrt(muDiffX.square().add()) * Math.sqrt(muDiffY.square().add()));
  },

  /**
   * @param {!ColNum} other
   * @returns {!Number}
   */
  cov(other) {
    return other.sub(other.mean()).mul(this.sub(this.mean())).mean();
  },

  /**
   * @param {!ColNum} other
   * @param {!Number} [p]
   * @returns {*}
   */
  dist(other, p = 2) {
    if (p === 1) {
      return this.sub(other).abs().add();
    } else if (p === 2) {
      return Math.sqrt(this.sub(other).square().add());
    } else {
      return this.sub(other).abs().pow(p).add() ** (1 / p);
    }
  },

  /**
   * @returns {!Number|undefined}
   */
  kurtosis() {
    const mu = this.mean();
    const xs = this.cast(`f${opts.FLOAT_PREC}`);
    const subMu = xs.sub(mu);
    const numerator = subMu.pow(4).add() / this.length;
    const denominator = (subMu.square().add() / this.length) ** 2;
    return numerator / denominator - 3;
  },

  /**
   * @param {!Number} n
   * @param {!Boolean} [wr]
   * @returns {!ColNum}
   */
  sample(n, wr = true) {
    if (n === null) {
      return this.sample(this.length, wr);
    }
    if (n < 1) {
      return this.sample(Math.floor(this.length * n), wr);
    }
    if (wr) {
      return this.subarray(0, n).map(() => this[randInt(0, this.length)]);
    }
    const sample = empty(n, `f${opts.FLOAT_PREC}`);
    const used = new Set();
    for (let ptr = 0; ptr < n; ptr++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * this.length);
      } while (used.has(idx));
      sample[ptr] = this[idx];
      used.add(idx);
    }
    return sample;
  },

  // central tendency

  /**
   * @returns {!Number|undefined}
   */
  mean() {
    return this.add() / this.length;
  },

  /**
   * @param {!Number} [n]
   * @param {!Number} [m]
   * @returns {!Number}
   */
  nQuart(n = 2, m = 4) {
    const ys = this.sort();
    if ((ys.length * n / m) % 1 !== 0) {
      return ys[Math.floor(ys.length * n / m)];
    }
    const middle = ys.length * n / m;
    return (ys[middle] + ys[middle - 1]) / 2;
  },

  /**
   * @returns {!Number|undefined}
   */
  Q1() {
    return this.nQuart(1, 4);
  },

  /**
   * @returns {!Number|undefined}
   */
  median() {
    return this.nQuart(2, 4);
  },

  /**
   * @returns {!Number|undefined}
   */
  Q3() {
    return this.nQuart(3, 4);
  },

  // spread

  /**
   * @param {DType|null} [dtype]
   * @returns {!Number|undefined}
   */
  var(dtype = null) {
    return this.sub(this.mean(), dtype).square(dtype).mean();
  },

  /**
   * @param {DType|null} [dtype]
   * @returns {!Number|undefined}
   */
  mad(dtype = null) {
    return this.sub(this.mean(), dtype).abs().mean();
  },

  /**
   * @param {DType|null} [dtype]
   * @returns {!Number|undefined}
   */
  stdev(dtype = null) {
    return Math.sqrt(this.var(dtype));
  },

  /**
   * @returns {!Number|undefined}
   */
  range() {
    return this.max() - this.min();
  },

  /**
   * @returns {!Number}
   */
  IQR() {
    return this.Q3() - this.Q1();
  },

  // linear algebra

  /**
   * @param {!ColNum} other
   * @returns {!Number}
   */
  dot(other) {
    return this.mul(other).add();
  },

  // pre-processing

  /**
   * INPUT:
   * a = [2, 3, 1, 4, 5, 6]
   * k = 2
   *
   * 1. Sort:
   *
   *  [1, 2, 3, 4, 5, 6]
   *
   * 2. Determine bin size:
   *
   *  binSize = a.length / k = 6 / 2 = 3
   *
   * 3. Determine boundaries:
   *
   *  bounds = [_, Infinity]
   *
   * 4. Bound 1 is in place binSize i.e. sortedA[3] = 4
   *    meaning all less than 4 are in bin #0
   *
   *  bounds = [4, Infinity]
   *
   * 5. Try to advance to next bin: 3 + binSize = 6. Out of bounds!
   *
   * @param {!Number} [k]
   * @param {!DType|null} [dtype]
   * @returns {!ColNum}
   */
  kBins(k = 5, dtype = null) {
    if (dtype === null) {
      return this.kBins(k, 'u8');
    }
    const sorted = this.sort();
    const bounds = Array(k).fill(0);
    bounds[bounds.length - 1] = Infinity;
    const binSize = Math.floor(this.length / k);

    let boundIdx = 0;

    for (let i = binSize; i < this.length; i += binSize) {
      bounds[boundIdx] = sorted[i];
      boundIdx++;
    }

    const s = empty(binSize, dtype);

    for (let i = 0; i < this.length; i++) {
      const val = this[i];
      for (let boundIdx = 0; boundIdx < k; boundIdx++) {
        const boundVal = bounds[boundIdx];
        if (val < boundVal) {
          s[i] = boundIdx;
          break;
        }
      }
    }

    s.kBinsBounds = bounds;

    return s;
  },

  /**
   * @param {!Number} [ord]
   * @returns {!ColNum}
   */
  disDiff(ord = 1) {
    if (ord === 0) return this;
    const newArr = empty(this.length, `f${opts.FLOAT_PREC}`);
    newArr[0] = 0;
    for (let i = 1; i < this.length; i++) {
      newArr[i] = this[i] - this[i - 1];
    }
    return newArr.disDiff(ord - 1);
  },

  /**
   * @param {!Number} [n]
   * @param {!Boolean} [doClone]
   * @returns {!ColNum|!ColStr|*}
   */
  smooth(n = 2, doClone = false) {
    if (n === 0) {
      throw new Error(`smoothing n must be >= 2`);
    }
    if (n === 1) return doClone ? this.clone() : this;
    const newArr = empty(this.length, `f${opts.FLOAT_PREC}`);
    for (let i = 0; i < n; i++) {
      newArr[i] = this[i];
    }
    for (let i = n; i < this.length; i++) {
      let total = 0;
      for (let j = 0; j < n; j++) {
        const val = this[i + j];
        total += val;
      }
      newArr[i] = total / n;
    }
    return newArr;
  },

  /**
   * @returns {!ColNum}
   */
  normalize() {
    const smallest = this.min();
    const denominator = this.max() - smallest;
    return empty(this.length).map((_, idx) => (this[idx] - smallest) / denominator);
  },

  /**
   * @returns {!ColNum}
   */
  removeAllOutliers() {
    const Q1 = this.Q1();
    const Q3 = this.Q3();
    return this.filter(x => x >= Q1 && x <= Q3);
  },

  /**
   * @param {!Number|null} [lBound]
   * @param {!Number|null} [uBound]
   * @returns {!ColNum}
   */
  clip(lBound = null, uBound = null) {
    if (lBound !== null && uBound !== null) {
      return this.map(v => v < lBound ? lBound : v > uBound ? uBound : v);
    } else if (lBound !== null) {
      return this.map(v => v < lBound ? lBound : v);
    } else {
      return this.map(v => v > uBound ? uBound : v);
    }
  },

  /**
   * @param {!Number} v
   * @param {!Number} y
   * @param {!Number} [delta]
   * @returns {!ColNum}
   */
  replace(v, y, delta = 0.001) {
    return this.map((x, idx) => Math.abs(x - v) <= delta ? y : x);
  },

  // functional programming

  zipWith(other, f, dtype = null) {
    return empty(this.length, dtype === null ? `f${opts.FLOAT_PREC}` : dtype).map((_, idx) => f(this[idx], other[idx]));
  },

  zipWith3(xs, ys, f, dtype = null) {
    return empty(this.length, dtype === null ? `f${opts.FLOAT_PREC}` : dtype).map((_, idx) => f(this[idx], xs[idx], ys[idx]));
  },

  // hacks

  /**
   * @param {!Number} a
   * @param {!Number} b
   * @returns {!ColNum}
   */
  slice(a, b) {
    const xs = this._slice(a, b);
    enh(xs);
    enhTypedArr(xs);
    return xs;
  },

  /**
   * @param {!Number} a
   * @param {!Number} b
   * @returns {!ColNum}
   */
  subarray(a, b) {
    const xs = this._subarray(a, b);
    enh(xs);
    enhTypedArr(xs);
    return xs;
  },

  /**
   * @param {Function} f
   * @returns {!ColStr}
   */
  map(f) {
    const xs = this._map(f);
    enh(xs);
    enhTypedArr(xs);
    return xs;
  },

  /**
   * @param {Function} f
   * @returns {!ColStr}
   */
  filter(f) {
    const xs = this._filter(f);
    enh(xs);
    enhTypedArr(xs);
    return xs;
  },
};

/**
 * @param {!TypedArray|!ColNum} a
 * @private
 */
const enhTypedArr = (a) => {
  // already enhanced
  if (a.dtype !== undefined && a.dtype !== 's') {
    return;
  }

  // hacks necessary to ensure immutability
  a._slice = a.slice;
  a._subarray = a.subarray;
  a._map = a.map;
  a._filter = a.filter;

  // memory & data type
  defineGetter(a, 'dtype', function dtype() {
    const match = dtypeRegex.exec(this.constructor.name);
    return match[1][0].toLocaleLowerCase() + match[2];
  });

  Object.assign(a, COL_NUM_PROTO);
};

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Number|null} [floatSize]
 * @returns {'i8'|'i16'|'i32'|'u8'|'u16'|'u32'|'f32'|'f64'} dtype
 * @private
 */
const guessNumDtype = (xs, floatSize = null) => {
  if (floatSize === null) {
    return guessNumDtype(xs, opts.FLOAT_PREC);
  }

  const notNaN = xs.filter(x => !Object.is(NaN, x));
  const largest = notNaN.reduce((a, b) => Math.max(a, b));
  const smallest = notNaN.reduce((a, b) => Math.min(a, b));
  const isFloat = notNaN.some(x => !Number.isInteger(x));
  log.debug(`max num is ${largest}, and min num is ${smallest}`);

  // reals
  if (isFloat) {
    if (smallest < 1.23e-38 || largest > 3.4e38) {
      log.debug('opted for f64');
      return 'f64';
    }
    log.debug('opted for f32');
    return 'f32';
  }

  const isNeg = smallest < 0;
  let bitsNeeded = Math.ceil(Math.log2(Math.max(largest + 1, Math.abs(smallest - 1))));

  if (isNeg) {
    bitsNeeded++; // sign bit
  }

  // integers
  if (isNeg) {
    if (bitsNeeded <= 8) {
      log.debug('opted for i8');
      return 'i8';
    } else if (bitsNeeded <= 16) {
      log.debug('opted for i16');
      return 'i16';
    } else if (bitsNeeded <= 32) {
      log.debug('opted for i32');
      return 'i32';
    }
  }

  log.debug(`guessed un-signed integer`);

  // natural numbers
  if (bitsNeeded <= 8) {
    log.debug('opted for u8');
    return 'u8';
  } else if (bitsNeeded <= 16) {
    log.debug('opted for u16');
    return 'u16';
  } else if (bitsNeeded <= 32) {
    log.debug('opted for u32');
    return 'u32';
  }

  log.debug(`huge number ${largest}, defaulting to f64`);
  return 'f64'; // huge number
};

/**
 * @param {!DType} dtype
 * @returns {Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Int8ArrayConstructor|Int16ArrayConstructor|Int32ArrayConstructor|Float32ArrayConstructor|Float64ArrayConstructor} constructor
 * @private
 */
const constFromDtype = (dtype) => {
  const match = dtypeRegex.exec(dtype);
  const nBits = match[2];
  const prefix = match[1];
  let type;
  if (prefix === 'f') {
    type = 'Float';
  } else if (prefix === 'u') {
    type = 'Uint';
  } else if (prefix === 'i') {
    type = 'Int';
  }
  return eval(`${type}${nBits}Array`);
};

/**
 *
 * @param {!Number} [a]
 * @param {?Number} [b]
 * @param {!Number} [step]
 * @private
 */
const rangeIter = function* (a = 0, b = null, step = 1) {
  if (b === null) {
    yield *rangeIter(0, a, step);
  } else {
    for (let i = a; i < b; i += step) {
      yield i;
    }
  }
};

/**
 *
 * @param {!Number} [a]
 * @param {!Number|null} [b]
 * @param {!Number} [step]
 * @returns {!ColNum} range
 */
const range = (a = 0, b = null, step = 1) => {
  if (b === null) return range(0, a);
  const newArr = empty(Math.ceil(b - a) / step, guessNumDtype([b - step, a + step]));
  let i = 0;
  for (const n of rangeIter(a, b, step)) {
    newArr[i] = n;
    i++;
  }
  return newArr;
};

/**
 * @param {!Iterable<*>} xs
 * @param {!Iterable<*>|null} [vocab]
 * @returns {!Map<Number>} multiset
 * @private
 */
const bag = (xs, vocab = null) => {
  if (vocab !== null) {
    return bag(new Set(vocab));
  }
  const b = new Map();
  for (const x of xs) {
    b.set(x, (b.get(x) || 0) + 1);
  }
  return b;
};

/**
 * @param {!Array<!number>|!Array<!String>|!TypedArray|!ColNum|!ColStr} xs
 * @param {!DType|null} [toDtype]
 * @returns {!ColNum|!ColStr} column
 */
const from = (xs, toDtype = null, doClone = true) => {
  if (toDtype === xs.dtype) {
    // preserve semantics of Array.from, which clones
    if (doClone) {
      log.debug('dtype matches hint, cloning Col');
      return xs.clone();
    } else {
      log.debug('dtype matches hint, returning as is');
      return xs;
    }
  }

  // use toDtype hint
  if (toDtype !== null && toDtype !== 's') {
    log.debug(`using dtype hint to make ${toDtype} Column`);
    const view = empty(xs.length, toDtype);
    view.set(xs);
    return view;
  }

  // return empty arrays
  if (xs.length === 0) {
    log.debug(`empty input, returning empty Column`);
    const ys = xs.constructor();
    enh(ys);
    enhStrArr(ys);
    return ys;
  }

  const isNum = !xs.some(x => x.constructor.name[0] !== 'N');
  // const isStr = !isNum;

  if (isNum) {
    log.debug(`creating numeric Column`);
    return empty(xs.length, toDtype).map((_, idx) => xs[idx]);
  }

  // else if (isStr)
  if (toDtype === 's') {
    log.debug('using s dtype hint to not try to parse values (saving time)');
    enh(xs);
    enhStrArr(xs);
    return xs;
  }

  /*
   * save some computation time by checking
   * if there is at least one num-like string
   */
  if (xs.some(x => x.match(isNumRegex))) {
    // tHEN try parsing all
    const tryParse = empty(xs.length, toDtype).map((_, idx) => parseFloat(xs[idx]));

    // bad parsing results in NaN
    const okRatio = tryParse.filter(x => !Object.is(NaN, x)).length / xs.length;

    // make sure most is OK
    if (okRatio >= opts.PARSE_NUM_RATIO) {
      log.debug(`OK, parsed string array to ${tryParse.dtype} Column`);
      return tryParse;
    } else {
      log.debug(`correctness = ${okRatio}`);
    }
  }

  log.debug('failed to parse string array, creating s Col');
  enh(xs);
  enhStrArr(xs);
  return xs;
};

/**
 * @param {!Number} [len]
 * @param {!DType|'s'|null} dtype
 * @returns {!ColNum|!ColStr} empty column
 */
const empty = (len = 0, dtype = null) => {
  if (dtype === 's') {
    const xs = Array(len).fill(null);
    enh(xs);
    enhStrArr(xs);
    return xs;
  } else if (dtype === null) {
    return empty(len, `f${opts.FLOAT_PREC}`);
  }
  switch (dtype.toLowerCase()) {
    case 'f32': return ColF32(len);
    case 'f64': return ColF32(len);
    case 'u32': return ColU32(len);
    case 'u16': return ColU16(len);
    case 'u8': return ColU8(len);
    case 'i32': return ColI32(len);
    case 'i16': return ColI16(len);
    case 'i8': return ColI8(len);
    default: throw new Error(`unrecognised dtype ${dtype}`);
  }
};

/**
 * @param {!Number} len
 * @param {!Number|null} [lBound]
 * @param {!Number|null} [uBound]
 * @param {!DType|null} [dtype]
 * @returns {!ColNum} rand array
 */
const rand = (len, lBound = null, uBound = null, dtype = null) => {
  if (lBound === null) {
    return rand(len, 0, uBound);
  } else if (uBound === null) {
    return rand(len, lBound, lBound + 1);
  }
  // else
  return empty(len, dtype).map(() => randInRange(lBound, uBound));
};

/**
 * @param {!Number} len
 * @param {!Number} val
 * @param {DType|null} [dtype]
 * @returns {!ColNum|!ColStr} array filled with value
 */
const repeat = (len, val, dtype = null) => empty(len, dtype === null ? guessNumDtype([val]) : dtype).fill(val);

/**
 * @param {!Number} len
 * @param {DType|null} [dtype]
 * @returns {!ColNum} array of zeros
 */
const ones = (len, dtype = null) => repeat(len, 1, dtype);

/**
 * By default typed arrays are filled with 0 so no need to .repeat()
 *
 * @param {!Number} len
 * @param {DType|null} [dtype]
 * @returns {!ColNum} array of zeros
 */
const zeros = (len, dtype = null) => empty(len, dtype === null ? 'u8' : dtype);

/**
 * @param {...*}  xs
 * @returns {!ColStr|!ColNum} array
 */
const of = (...xs) => from(xs, null, false);

/**
 * @param {*} xs
 * @returns {!Boolean}
 */
const isColNum = xs => xs.dtype !== undefined && !!xs.dtype.match(dtypeRegex);

/**
 * @param {*} xs
 * @returns {!Boolean}
 */
const isColStr = xs => xs.dtype === 's';

/**
 * @param {*} xs
 * @returns {!Boolean}
 */
const isCol = xs => isColNum(xs) || isColStr(xs);

/**
 * @param {!Function} f
 * @param {!Number} n
 * @returns {!ColNum}
 */
const fromFunct = (f, n) => empty(n, `f${opts.FLOAT_PREC}`).map((_, idx) => f(idx));

const PRODUCERS = {};
for (const p of ['Uint8', 'Uint16', 'Uint32', 'Int8', 'Int16', 'Int32', 'Float32', 'Float64']) {
  const dtype = p.toLowerCase()
    .replace('uint', 'U')
    .replace('float', 'F')
    .replace('int', 'I');

  /**
   * @param {!Number} [len]
   */
  PRODUCERS[`Col${dtype}`] = (len = 0) => {
    const match = dtypeRegex.exec(dtype);
    const bytesNeeded = parseInt(match[2]) / 8;
    const constructor = constFromDtype(dtype.toLowerCase());
    const arr = new constructor(new ArrayBuffer(bytesNeeded * len));
    enh(arr);
    enhTypedArr(arr);
    return arr;
  };
}

const { ColF32, ColF64, ColU8, ColU16, ColU32, ColI8, ColI16, ColI32 } = PRODUCERS;

Object.setPrototypeOf(COL_STR_PROTO, COL_PROTO);
Object.setPrototypeOf(COL_NUM_PROTO, COL_PROTO);

module.exports = Object.freeze(
  { ...({
    empty,
    repeat,
    from,
    fromFunct,
    isCol,
    isColNum,
    isColStr,
    of,
    ones,
    opts,
    rand,
    range,
    zeros,
  }),
  ...PRODUCERS,
  ...(process.env.TESTING === '1' ? {
    bag,
    constFromDtype,
    guessNumDtype,
    rangeIter,
  } : {}) },
);
