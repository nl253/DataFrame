// vim:hlsearch:nu:
const util = require('util');
const { randInRange, randInt } = require('./rand');

const dtypeRegex = /\s*([a-z]+)(8|16|32|64)\s*/i;
const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)(e-?\d+)?$/i;
const log = require('./log');
const env = require('./env');

const PARSE_NUM_RATIO = 0.7;

/**
 * @param {!Array<*>|!TypedArray} a
 * @returns {!Array<*>|!TypedArray} a
 * @private
 */
function enhance(a) {
  // already enhanced
  if (a.randEl !== undefined) {
    return a;
  }

  a.convert = function (dtype = null) {
    if (dtype === this.dtype) {
      return this;
    }
    // else
    return from(this, dtype);
  };

  // printing

  a.toString = function (len = null) {
    if (len === null) {
      return this.toString(env.HEAD_LEN);
    } else if (len > this.length) {
      log.warn(`len = ${len}, but there is ${this.length} items`);
    }
    const parts = [`Series ${this.dtype === undefined ? '' : this.dtype}[`];
    const n = Math.min(len, this.length);
    for (let i = 0; i < n; i++) {
      const val = this[i];
      const s = val.toString();
      // TODO use fmtFloat
      const isStr = val.constructor.name === 'String';
      const isNum = !isStr && val.constructor.name === 'Number';
      const isFloat = isNum && s.match(/\./);
      if (isFloat) {
        const [p1, p2] = s.split('.');
        parts.push(`${p1}.${p2.slice(0, env.PRINT_PREC)}`);
      } else /* int */ {
        parts.push(s);
      }
    }
    if (n < this.length) {
      parts.push(`... ${this.length - n} more`);
    }
    return `${parts[0] + parts.slice(1).join(', ')}]`;
  };

  a.print = function (n = null) {
    if (n === null) {
      return this.print(env.HEAD_LEN);
    }
    return console.log(this.toString(n));
  };

  a[util.inspect.custom] = function (depth, options) {
    return this.toString(env.HEAD_LEN);
  };

  // cumulative operations

  a.cum = function (f = 'add', dtype = null) {
    if (this.length === 0) {
      return this;
    } else if (dtype === null) {
      return this.cum(f, this.dtype);
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
    if (f.constructor.name === 'String') {
      for (let i = this.length - 1; i > 0; i--) {
        newArr[i] = this.subarray(0, i + 1)[f]();
      }
    } else {
      for (let i = this.length - 1; i > 0; i--) {
        newArr[i] = f(this.subarray(0, i + 1));
      }
    }
    return newArr;
  };

  // other

  a.counts = function () { return bag(this); };

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  defineGetter('randEl', function () {
    return this[Math.floor(randInRange(0, this.length))];
  });

  defineGetter('isEmpty', function () {
    return this.length === 0;
  });

  a.argMax = function (f) {
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
  };

  a.argMin = function (f) {
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
  };

  // pre-processing

  /*
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
   */
  a.kBins = function (k = 5, dtype = null) {
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

    const s = Series.empty(binSize, dtype);

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
  };


  // boolean

  a.all = function (f) {
    return !this.some((v, idx, arr) => !f(v, idx, arr));
  };

  a.none = function (f) {
    return !this.some((v, idx, arr) => f(v, idx, arr));
  };

  a.contains = function (v) {
    return this.some(x => x === v);
  };

  // manipulation


  a.drop = function (v) {
    return this.filter(a => !Object.is(a, v));
  };

  a.swap = function (i, j) {
    const save = this[i];
    this[i] = this[j];
    this[j] = save;
    return this;
  };

  a._sort = a.sort;
  a.sort = function (order = 'asc') {
    if (order === 'asc') {
      return this.clone()._sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
    } else if (order === 'des') {
      return this.clone()._sort((a, b) => (a > b ? -1 : a < b ? 1 : 0));
    } else {
      return this.clone()._sort(order);
    }
  };

  a._shuffle = function () {
    for (let i = this.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this[i], this[j]] = [this[j], this[i]];
    }
    return this;
  };

  a.shuffle = function () {
    return this.clone()._shuffle();
  };

  a.mode = function () {
    if (this.length === 1) return this[0];
    const counts = Array.from(bag(this)
      .entries())
      .map(([s, count]) => [s, count]);

    if (counts.length === 1) {
      return counts[0][0];
    }

    return counts.reduce(([val1, count1], [val2, count2]) => (count2 > count1
      ? [val2, count2]
      : [val1, count1]))[0];
  };

  return a;
}

/** 
 * @param {!Array<!Date>} date array
 * @returns {!Array<!Date>} date array
 */
function enhDateArr(x) {
  return a;
}

/**
 * @param {!Array<*>} a
 * @returns {!Array<*>} the array
 * @private
 */
function enhStrArr(a) {
  a = enhance(a);

  // already enhanced
  if (a.dtype !== undefined) {
    return a;
  }

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  // memory & data type

  defineGetter('dtype', function () {
    if (this.isEmpty) {
      return 'null';
    } else if (this[0].constructor.name === 'String') {
      return 's';
    } else {
      return this[0].constructor.name.toLocaleLowerCase();
    }
  });


  a.clone = function () {
    return Array.from(this);
  };

  // pre-processing
  
  a.replace = function (pat, y) {
    return this.map((x, idx) => x.replace(pat, y));
  };

  a.labelEncode = function (dtype = null) {
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
  };

  a.unique = function () {
    return Array.from(new Set(this));
  };

  // basic stats

  a.sample = function (n, wr = true) {
    if (n === null) {
      return this.sample(this.length, wr);
    }
    if (n < 1) {
      return this.sample(Math.floor(this.length * n), wr);
    }
    if (wr) {
      return Array(n).fill(0).map(_ => this[randInt(0, this.length)]);
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
    return sample;
  };

  // manipulation, views and slices

  a.head = function (n = null) {
    if (n === null) {
      return this.head(env.HEAD_LEN);
    }
    return this.slice(0, n);
  };

  a.tail = function (n = null) {
    if (n === null) {
      return this.tail(env.HEAD_LEN);
    }
    return this.slice(this.length - n);
  };

  // functional programming

  a.zipWith = function (other, f) {
    return Array(this.length.fill(0).map((_, idx) => f(this[idx], other[idx])));
  };

  a.zipWith3 = function (xs, ys, f) {
    return Array(this.length.fill(0).map((_, idx) => f(this[idx], xs[idx], ys[idx])));
  };

  // hacks

  a._reverse = a.reverse;
  a.reverse = function () {
    const cpy = Array(this.length).fill(0);
    let j = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      cpy[i] = this[j];
      j++;
    }
    return cpy;
  };

  a._concat = a.concat;
  a.concat = function (other) {
    return enhStrArr(this._concat(other));
  };

  a._slice = a.slice;
  a.slice = function (n, m) {
    return enhStrArr(this._slice(n, m));
  };
  a.subarray = a.slice;

  a._map = a.map;
  a.map = function (f, dtype = null) {
    return enhStrArr(this._map(f));
  };

  a._filter = a.filter;
  a.filter = function (f) {
    return enhStrArr(this._filter(f));
  };

  return a;
}

/**
 * @param {!TypedArray} a
 * @returns {!TypedArray} the array
 * @private
 */
function enhTypedArr(a) {
  a = enhance(a);

  // already enhanced
  if (a.dtype !== undefined) {
    return a;
  }

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  // memory & data type
  defineGetter('dtype', function () {
    const match = dtypeRegex.exec(this.constructor.name);
    return match[1].slice(0, 1).toLocaleLowerCase() + match[2];
  });

  a.memory = function () {
    return this.BYTES_PER_ELEMENT * this.length;
  };

  a.cast = function (toDtype) {
    if (toDtype === this.dtype) {
      return this;
    }
    const newArr = empty(this.length, toDtype);
    newArr.set(this);
    return newArr;
  };

  a.downcast = function () {
    const guess = guessNumDtype(this);
    if (guess === this.dtype) {
      return this;
    }
    const newArr = empty(this.length, guess);
    newArr.set(this);
    return newArr;
  };

  a.clone = function (dtype = null) {
    const newArr = empty(this.length, dtype === null ? this.dtype : dtype);
    newArr.set(this);
    return newArr;
  };

  a._reverse = a.reverse;
  a.reverse = function () {
    const cpy = empty(this.length, this.dtype);
    let j = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      cpy[i] = this[j];
      j++;
    }
    return cpy;
  };

  // manipulation, views and slices

  a.head = function (n = null) {
    if (n === null) {
      return this.head(env.HEAD_LEN);
    }
    return this.subarray(0, n);
  };

  a.tail = function (n = null) {
    if (n === null) {
      return this.tail(env.HEAD_LEN);
    }
    return this.subarray(this.length - n);
  };

  a.unique = function () {
    const s = new Set(this);
    const newArr = empty(s.size, this.dtype);
    let i = 0;
    for (const x of s) {
      newArr[i] = x;
      i++;
    }
    return newArr;
  };

  a.takeWhile = function (f) {
    let i = 0;
    while (f(this[i]) && i < this.length) i++;
    return this.subarray(0, i);
  };

  a.concat = function (other) {
    let dtype = `f${env.FLOAT_PREC}`;
    if (this.dtype[0] === other.dtype[0]) {
      dtype = this.BYTES_PER_ELEMENT >= other.BYTES_PER_ELEMENT ? this.dtype : other.dtype;
    } else if ((other.dtype.startsWith('u') && this.dtype.startsWith('i')) || (this.dtype.startsWith('u') && other.dtype.startsWith('i'))) {
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
  };

  a.nLargest = function (n = null) {
    if (n === null) {
      return this.nLargest(env.HEAD_LEN);
    }
    return this.sort('des').subarray(0, n);
  };

  a.nSmallest = function (n = null) {
    if (n === null) {
      return this.nSmallest(env.HEAD_LEN);
    }
    return this.sort('asc').subarray(0, n);
  };

  a.pop = function (idx) {
    const newArr = empty(this.length - 1, this.dtype);
    newArr.set(this.subarray(0, idx));
    newArr.set(this.subarray(idx + 1), idx);
    return newArr;
  };

  // arithmetic

  a.add = function (other = null, dtype = null) {
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
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x + other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, 'i32').map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] * other);
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

    if ((isFloat && amFloat) || (isUint && amUint) || (isInt && amInt)) {
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
      if (myBits >= (otherBits * 2)) {
        return this.map((x, idx) => x + other[idx]);
      } else {
        return empty(len, 'i32').map((_, idx) => this[idx] + other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`).map((_, idx) => this[idx] + other[idx]);
      }
    }
    return empty(len, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] * other[idx]);
  };

  a.sub = function (other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x - y);
    } 
    
    // is array, elemnt-wise op 
    if (other.constructor.name[0] !== 'N') {
      // TODO fix inefficient a.sub
      return this.add(other.mul(-1, dtype), dtype);
    }

    // is number (so subtract other for all elements)

    if (this.dtype[0] === 'f') {
      return this.map(x => x - other);
    } 

    // am int and is int (but could be signed)
    if (Number.isInteger(other)) {
      const bits = this.BYTES_PER_ELEMENT * 8;
      const worstCase1 = 2**bits - other;
      const worstCase2 = 2**bits + other;
      const worstCase3 = -(2**bits) + other;
      const worstCase4 = -(2**bits) - other;
      const scenarios = [worstCase1, worstCase2, worstCase3, worstCase4];
      const dtype = guessNumDtype(scenarios); 
      return empty(this.length, dtype).map((_, idx) => this[idx] - other);
    } 

    return empty(this.length, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] - other);
  };

  a.mul = function (other = null, dtype = null) {
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
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x * other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, `i32`).map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] * other);
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
      if (myBits >= (otherBits * 2)) {
        return this.map((x, idx) => x * other[idx]);
      } else {
        return empty(len, 'i32').map((_, idx) => this[idx] * other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`).map((_, idx) => this[idx] * other[idx]);
      }
    }
    return empty(len, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] * other[idx]);
  };

  a.div = function (other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x / y);
    }
    const myDtype = this.dtype;
    const amFloat = myDtype.match('f');

    if (other.constructor.name === 'Number') {
      if (dtype !== null) {
        return empty(this.length, dtype)
          .map(x => x / other);
      }
      return empty(this.length, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] / other);
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
    return empty(len, `f${env.FLOAT_PREC}`).map((_, idx) => this[idx] / other[idx]);
  };

  a.root = function (n, dtype = null) {
    return this.pow(1 / n, dtype);
  };

  a.sqrt = function (dtype = null) {
    if (dtype === null || dtype === this.dtype) {
      return this.map(x => Math.sqrt(x));
    } else {
      return empty(this.length, dtype).map(x => Math.sqrt(x));
    }
  };

  a.cbrt = function (dtype = null) {
    if (dtype === null || dtype === this.dtype) {
      return this.map(x => Math.cbrt(x));
    } else {
      return empty(this.length, dtype).map(x => Math.cbrt(x));
    }
  };

  a.pow = function (n, dtype = null) {
    if (n === 0) {
      return ones(this.length, dtype);
    } else if (n === 1) {
      return this.clone(dtype);
    } else if (dtype === null || this.dtype === dtype) {
      return this.map(x => x ** n);
    } else {
      return empty(this.length, dtype).map((_, idx) => this[idx] ** n);
    }
  };

  a.cube = function (dtype = null) {
    return this.pow(3, dtype);
  };

  a.square = function (dtype = null) {
    return this.pow(2, dtype);
  };

  // basic math ops

  a.abs = function () {
    const { dtype } = this;
    if (dtype.startsWith('i')) {
      return this.cast(`u${Math.min(32, this.BYTES_PER_ELEMENT * 8 * 2)}`);
    } else {
      return this.map(x => Math.abs(x));
    }
  };

  for (const op of ['trunc', 'round', 'ceil', 'floor']) {
    a[op] = function () {
      log.info('you might want to downcast now to save memory');
      return this.map(x => Math[op](x));
    };
  }

  // basic stats

  a.max = function () {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.max(v1, v2));
  };

  a.min = function () {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.min(v1, v2));
  };

  a.skewness = function () {
    const xs = this.cast(`f${env.FLOAT_PREC}`);
    return xs.sub(this.mean()).cube().mean() / (xs.var() ** (3 / 2));
  };

  a.corr = function (other) {
    const muDiffX = this.cast(`f${env.FLOAT_PREC}`).sub(this.mean());
    const muDiffY = other.cast(`f${env.FLOAT_PREC}`).sub(other.mean());
    return muDiffX.mul(muDiffY).add() / (Math.sqrt(muDiffX.square().add()) * Math.sqrt(muDiffY.square().add()));
  };

  a.kurtosis = function () {
    const mu = this.mean();
    const xs = this.cast(`f${env.FLOAT_PREC}`);
    const subMu = xs.sub(mu);
    const numerator = subMu.pow(4).add() / this.length;
    const denominator = (subMu.square().add() / this.length) ** 2;
    return (numerator / denominator) - 3;
  };

  a.sample = function (n, wr = true) {
    if (n === null) {
      return this.sample(this.length, wr);
    }
    if (n < 1) {
      return this.sample(Math.floor(this.length * n), wr);
    }
    if (wr) {
      return this.subarray(0, n).map(_ => this[randInt(0, this.length)]);
    }
    const sample = empty(n, `f${env.FLOAT_PREC}`);
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
  };

  // central tendency

  a.mean = function () {
    return this.add() / this.length;
  };

  a.nQuart = function (n = 2, m = 4) {
    const ys = this.sort();
    if ((ys.length * n / m) % 1 !== 0) {
      return ys[Math.floor(ys.length * n / m)];
    }
    const middle = ys.length * n / m;
    return (ys[middle] + ys[middle - 1]) / 2;
  };

  a.Q1 = function () {
    return this.nQuart(1, 4);
  };

  a.median = function () {
    return this.nQuart(2, 4);
  };

  a.Q3 = function () {
    return this.nQuart(3, 4);
  };

  // spread

  a.var = function (dtype = null) {
    return this.sub(this.mean(), dtype).square(dtype).mean();
  };

  a.mad = function (dtype = null) {
    return this.sub(this.mean(), dtype).abs().mean();
  };

  a.stdev = function (dtype = null) {
    return Math.sqrt(this.var(dtype));
  };

  a.range = function () {
    return this.max() - this.min();
  };

  a.IQR = function () {
    return this.Q3() - this.Q1();
  };

  // linear algebra

  a.dot = function (other) {
    return this.mul(other).add();
  };

  // pre-processing

  a.normalize = function () {
    const smallest = this.min();
    const denominator = this.max() - smallest;
    return empty(this.length).map((_, idx) => (this[idx] - smallest) / denominator);
  };

  a.dropInfinity = function () {
    return this.drop(Infinity);
  };

  a.dropNaN = function () {
    return this.drop(NaN);
  };

  a.dropOutliers = function () {
    const Q1 = this.Q1();
    const Q3 = this.Q3();
    return this.filter(x => x >= Q1 && x <= Q3);
  };

  a.clip = function (lBound = null, uBound = null) {
    if (lBound !== null && uBound !== null) {
      return this.map(v => (v < lBound ? lBound : v > uBound ? uBound : v));
    } else if (lBound !== null) {
      return this.map(v => (v < lBound ? lBound : v));
    } else {
      return this.map(v => (v > uBound ? uBound : v));
    }
  };

  a.replace = function (v, y) {
    return this.map((x, idx) => x === v ? y : x );
  };

  // functional programming

  a.zipWith = function (other, f, dtype = null) {
    return empty(this.length, dtype === null ? `f${env.FLOAT_PREC}` : dtype).map((_, idx) => f(this[idx], other[idx]));
  };

  a.zipWith3 = function (xs, ys, f, dtype = null) {
    return empty(this.length, dtype === null ? `f${env.FLOAT_PREC}` : dtype).map((_, idx) => f(this[idx], xs[idx], ys[idx]));
  };

  // hacks

  a._slice = a.slice;
  a.slice = function (a, b) {
    return enhTypedArr(this._slice(a, b));
  };

  a._subarray = a.subarray;
  a.subarray = function (a, b) {
    return enhTypedArr(this._subarray(a, b));
  };

  a._map = a.map;
  a.map = function (f) {
    return enhTypedArr(this._map(f));
  };

  a._filter = a.filter;
  a.filter = function (f) {
    return enhTypedArr(this._filter(f));
  };

  return a;
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Number} [floatSize]
 * @returns {'i8'|'i16'|'i32'|'u8'|'u16'|'u32'|'f32'|'f64'} dtype
 * @private
 */
function guessNumDtype(xs, floatSize = null) {
  if (floatSize === null) {
    return guessNumDtype(xs, env.FLOAT_PREC);
  }

  const isNeg = xs.some(x => x < 0);
  const largest = xs.map(x => Math.abs(x)).reduce((a, b) => Math.max(a, b));
  let bitsNeeded = Math.ceil(Math.log2(largest + 1));
  const isFloat = xs.some(x => !Number.isInteger(x) && !Object.is(x, NaN));

  if (isNeg) bitsNeeded++; // sign bit

  // reals
  if (isFloat) {
    if (-largest <= 1.23e-38 || largest >= 3.4e38) {
      return 'f64';
    } 
    // else 
    return 'f32';
  }

  // integers
  if (isNeg) {
    if (bitsNeeded <= 8) {
      return 'i8';
    } else if (bitsNeeded <= 16) {
      return 'i16';
    } else if (bitsNeeded <= 32) {
      return 'i32';
    }
  }

  // natural numbers
  if (bitsNeeded <= 8) {
    return 'u8';
  } else if (bitsNeeded <= 16) {
    return 'u16';
  } else if (bitsNeeded <= 32) {
    return 'u32';
  }

  return 'f64'; // huge number
}

/**
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dtype
 * @returns {Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Int8ArrayConstructor|Int16ArrayConstructor|Int32ArrayConstructor|Float32ArrayConstructor|Float64ArrayConstructor} constructor
 * @private
 */
function constFromDtype(dtype) {
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
}

/**
 *
 * @param {!Number} [a]
 * @param {?Number} [b]
 * @param {!Number} [step]
 */
function* rangeIter(a = 0, b = null, step = 1) {
  if (b === null) {
    yield* rangeIter(0, a, step);
  } else {
    for (let i = a; i < b; i += step) {
      yield i;
    }
  }
}

/**
 *
 * @param {!Number} [a]
 * @param {!Number} [b]
 * @param {!Number} [step]
 * @returns {!TypedArray<Number>} range
 */
function range(a = 0, b = null, step = 1) {
  if (b === null) return range(0, a);
  const newArr = empty((Math.ceil(b - a) / step), guessNumDtype([b - step, a + step]));
  let i = 0;
  for (const n of rangeIter(a, b, step)) {
    newArr[i] = n;
    i++;
  }
  return newArr;
}

/**
 * @param {!Iterable<*>} xs
 * @param {?Iterable<*>} [vocab]
 * @returns {Map<Number>} multiset
 */
function bag(xs, vocab = null) {
  if (vocab !== null) {
    return bag(new Set(vocab));
  }
  const b = new Map();
  for (const x of xs) {
    b.set(x, (b.get(x) || 0) + 1);
  }
  return b;
}


/**
 * @param {!Array<*>|!TypedArray} xs
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"|null} [toDtype]
 * @returns {!TypedArray|!Array<*>} series
 */
function from(xs, toDtype = null) {
  // preserve semantics of Arra.from, which clones
  if (toDtype === xs.toDtype) {
    log.debug(`dtype matches hint, cloning Series`);
    return xs.clone();
  }

  // use toDtype hint
  if (toDtype !== null && toDtype !== 's') {
    log.debug(`using dtype hint to make ${toDtype} Series`);
    const view = empty(xs.length, toDtype);
    view.set(xs);
    return view;
  }

  // return empty arrays
  if (xs.length === 0) {
    log.debug(`empty input, returning empty Series`);
    return enhance(xs.constructor());
  }

  const isNum = !xs.some(x => x.constructor.name[0] !== 'N');
  const isStr = !isNum;

  if (isStr) {

    if (toDtype === 's') {
      log.debug(`using s dtype hint to not try to parse values (saving time)`);
      return enhStrArr(xs);
    }

    // save some computation time by checking 
    // if there is at least one num-like string
    if (xs.some(x => x.match(isNumRegex))) {

      // THEN try parsing all
      const tryParse = xs.map(parseFloat);

      // bad parsing results in NaN
      const okRatio = tryParse.filter(x => !Object.is(NaN, x)).length / xs.length;

      // make sure most is OK
      if (okRatio >= PARSE_NUM_RATIO) {
        log.debug(`succesfully parsed string array to numeric`);
        xs = tryParse;

      } else {
        log.debug(`failed to parse to numeric, creating S series`);
        return enhStrArr(xs);
      }

    } else {
      log.debug(`failed to parse to numeric, creating s Series`);
      return enhStrArr(xs);
    }
  } 

  log.debug(`creating numeric Series`);
  return empty(xs.length, toDtype).map((_, idx) => xs[idx]);
}

/**
 * @param {!Number} [len]
 * @param {"u32"|"u16"|"u8"|"i32"|"i16"|"i8"|"f64"|"f32"|null|"s"} dtype
 * @returns {!TypedArray|!Array<*>} empty array
 */
function empty(len = 0, dtype = null) {
  if (dtype === 's') {
    return Array(len).fill(null);
  } else if (dtype === null) {
    return empty(len, `f${env.FLOAT_PREC}`);
  }
  // else
  const match = dtypeRegex.exec(dtype);
  const bytesNeeded = parseInt(match[2]) / 8;
  const constructor = constFromDtype(dtype);
  return enhTypedArr(new constructor(new ArrayBuffer(bytesNeeded * len)));
}

/**
 * @param {!Number} len
 * @param {?Number} lBound
 * @param {?Number} uBound
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} rand array
 */
function rand(len, lBound = null, uBound = null, dtype = null) {
  if (lBound === null) {
    return rand(len, 0, uBound);
  } else if (uBound === null) {
    return rand(len, lBound, lBound + 1);
  } 
  // else 
  return empty(len, dtype).map(_ => randInRange(lBound, uBound));
}

/**
 * @param {!Number} len
 * @param {!Number} val
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} array filled with value
 */
function fill(len, val, dtype = null) {
  return empty(len, dtype === null ? guessNumDtype([val]) : dtype).fill(val);
}

/**
 * @param {!Number} len
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} array of zeros
 */
function ones(len, dtype = null) {
  return fill(len, 1, dtype);
}

/**
 * @param {!Number} len
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} array of zeros
 */
function zeros(len, dtype = null) {
  // by default typed arrays are filled with 0 so no need to .fill()
  return empty(len, dtype === null ? 'u8' : dtype);
}

/**
 * @param xs
 * @returns {!Array<*>|!TypedArray} array
 */
function of(...xs) {
  return from(xs);
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!Boolean}
 */
function isSeriesNum(xs) {
  return xs.dtype !== undefined && !!xs.dtype.match(dtypeRegex);
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!Boolean}
 */
function isSeriesStr(xs) {
  return xs.dtype === 's';
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!Boolean}
 */
function isSeries(xs) {
  return isSeriesNum(xs) || isSeriesStr(xs);
}

let Series;

if (process.env.TESTING === '1')  {
  // everything is exposed for unit testing
  Series = {
    bag,
    constFromDtype,
    empty,
    isSeriesNum,
    isSeries,
    isSeriesStr,
    fill,
    from,
    guessNumDtype,
    of,
    ones,
    env,
    rand,
    range,
    rangeIter,
    zeros,
  };
} else {
  Series = {
    empty,
    fill,
    isSeries,
    isSeriesStr,
    from,
    of,
    ones,
    env,
    rand,
    range,
    zeros,
  };
}

module.exports = Series;
