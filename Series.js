const util = require("util");
const { randInRange, randInt } = require('./rand');
const dtypeRegex = /([a-z]+)(8|16|32|64)/i;
const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)$/g;

const HEAD_LEN = 5;
const PRECISION = 2;

/**
 *
 * @param {!Number} [a]
 * @param {?Number} [b]
 * @param {!Number} [step]
 */
function* rangeIter(a = 0, b = null, step = 1) {
  if (b === null) {
    yield* rangeIter(0, a, step);
  }
  for (let i = a; i < b; i += step) yield i;
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
 *
 * @param {!Number} [a]
 * @param {!Number} [b]
 * @param {!Number} [step]
 * @returns {!TypedArray<Number>} range
 */
function range(a = 0, b = null, step = 1) {
  if (b === null) return range(0, a);
  const newArr = empty((Math.ceil(b - a) / step), guessDtype([b - step, a + step]));
  let i = 0;
  for (const n of rangeIter(a, b, step)) {
    newArr[i] = n;
    i++;
  }
  return newArr;
}

// /**
//  * @param {!Array<!Number>|!TypedArray} xs
//  * @returns {!Array<!Number>|!TypedArray} safe common dtype
//  */
// function cumOp(xs, f) {
//   if (xs.length === 0) return xs;
//   const newArr = empty(xs.length);
//   newArr[0] = xs[0];
//   if (xs.length === 1) return newArr;
//   if (xs.constructor.name === 'Array') {
//     for (let i = xs.length - 1; i >= 0; i--) {
//       newArr[i] = f(xs.subarray(0, i + 1));
//     }
//   } else {
//     for (let i = xs.length - 1; i >= 0; i--) {
//       newArr[i] = f(xs.slice(0, i + 1));
//     }
//   }
//   return newArr;
// }

// /**
//  * @param {!Array<!Number>|!TypedArray} xs
//  * @param {"sum"|"product"|"min"|"max"|"variance"|"stdev"|"majorityVote"|"mad"|"mean"|"mode"} functName
//  * @returns {!Array<!Number>|!TypedArray} array
//  */
// function cum(xs, functName) {
//   return cumOp(xs, eval(functName));
// }

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Number} [floatSize]
 * @returns {'i8'|'i16'|'i32'|'u8'|'u16'|'u32'|'f32'|'f64'} dtype
 */
function guessDtype(xs, floatSize = 64) {
  let largest = xs.reduce((a, b) => Math.max(a, b));
  const smallest = xs.reduce((a, b) => Math.min(a, b));
  if (smallest < 0 && Math.abs(smallest) > largest) {
    largest = Math.abs(smallest);
  }
  let bitsNeeded = Math.ceil(Math.log2(largest + 1));
  const isNeg = smallest < 0;
  const isFloat = xs.some(x => !Number.isInteger(x));
  if (isNeg) bitsNeeded++;

  // reals
  if (isFloat) return `f${floatSize}`;

  // integers
  if (isNeg) {
    if (bitsNeeded <= 8) {
      return 'i8';
    } else if (bitsNeeded <= 16) {
      return 'i16';
    } else if (bitsNeeded <= 32) {
      return 'i32';
    } else {
      throw new Error('numbers to large to represent');
    }
  }

  // natural numbers
  if (bitsNeeded <= 8) {
    return 'u8';
  } else if (bitsNeeded <= 16) {
    return 'u16';
  } else if (bitsNeeded <= 32) {
    return 'u32';
  } else {
    throw new Error('numbers to large to represent');
  }
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!TypedArray|!Array<*>} series
 */
function from(xs) {
  // return empty arrays
  if (xs.length === 0) {
    return xs;
  } else if (xs[0].constructor.name !== 'Number') {
    // return string cols that aren't nums
    if (xs[0].constructor.name !== 'String' || xs.find(val => !val.match(isNumRegex))) {
      return enhanceArray(xs);
    } else {
      // parse string cols that are actually nums
      xs = xs.map(parseFloat);
    }
  } else if (xs.constructor.name.indexOf('Array') >= 0 && xs.constructor.name !== 'Array') {
    // return typed arrays unchanged
    return xs;
  }
  const view = empty(xs.length, guessDtype(xs));
  view.set(xs);
  return view;
}

/**
 * @param {!Array<*>|!TypedArray} a
 * @returns {!Array<*>|!TypedArray} a
 */
function enhance(a) {
  if (a.randEl !== undefined) {
    return a;
  }

  a.toString = function() {
    const parts = ['Series ' + (this.dtype === undefined ? '' : this.dtype + ' ') + '['];
    const n = Math.min(HEAD_LEN, this.length); 
    for (let i = 0; i < n; i++) {
      const val = this[i];
      const s = val.toString();
      if (val.constructor.name === 'Number' && s.match(/\./)) {
        const [p1, p2] = s.split('.');
        parts.push(`${p1}.${p2.slice(0, PRECISION)}`);
      } else {
        parts.push(s);
      }
    }
    if (n < this.length)  {
      parts.push(`... ${this.length - n} more`);
    }
    return parts[0] + parts.slice(1).join(', ') + ']';
  };

  a[util.inspect.custom] = function (depth, options) {
    return this.toString();
  };

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });
  defineGetter('randEl', function () {
    return this[Math.floor(randInRange(0, this.length))];
  });
  defineGetter('isEmpty', function () {
    return this.length === 0;
  });

  a.replace = function (v, y) {
    return this.map((x, idx) => x === v ? y : x);
  };

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

  a.swap = function (i, j) {
    const save = this[i];
    this[i] = this[j];
    this[j] = save;
    return this;
  };

  a.drop = function (v) {
    return this.filter(a => a === v);
  };

  a.all = function (f) {
    return !this.some((v, idx, arr) => !f(v, idx, arr));
  };
  a.none = function (f) {
    return !this.some((v, idx, arr) => f(v, idx, arr));
  };
  a.contains = function (v) {
    return this.some(x => x === v);
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

  a.counts = function () { return bag(this); };
  return a;
}

/**
 * @param {!Array<*>} a
 * @returns {!Array<*>} the array
 */
function enhanceArray(a) {
  a = enhance(a);

  if (a.dtype !== undefined) return a;

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  defineGetter('dtype', function () {
    if (this.isEmpty) {
      return 'null'
    } else if (this[0].constructor.name === 'String') {
      return this[0].constructor.name.toLocaleLowerCase().slice(0, 1);
    } else {
      return this[0].constructor.name.toLocaleLowerCase();
    }
  });

  a.clone = function () {
    return Array.from(this);
  };

  a.unique = function () {
    return Array.from(new Set(this));
  };

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

  a.head = function (n = HEAD_LEN) {
    return this.slice(0, n);
  };

  a.tail = function (n = HEAD_LEN) {
    return this.slice(this.length - n);
  };

  a.print = function (n = HEAD_LEN) {
    return console.log(this.toString());
  };

  a._concat = a.concat;
  a.concat = function(other) {
    return enhanceArray(this._concat(other));
  };

  a._slice = a.slice;
  a.slice = function (n, m) {
    return enhanceArray(this._slice(n, m));
  };
  a.subarray = a.slice;

  a._map = a.map;
  a.map = function (f, dtype = null) {
    return enhanceArray(this._map(f));
  };

  a._filter = a.filter;
  a.filter = function (f) {
    return enhanceArray(this._filter(f));
  };

  a.zipWith = function (other, f) {
    return Array(this.length.fill(0).map((_, idx) => f(this[idx], other[idx])));
  };

  a.zipWith3 = function (xs, ys, f) {
    return Array(this.length.fill(0).map((_, idx) => f(this[idx], xs[idx], ys[idx])));
  };

  return a;
}

/**
 * @param {!TypedArray} a
 * @returns {!TypedArray} the array
 */
function enhanceTypedArray(a) {
  a = enhance(a);
  if (a.dtype !== undefined) return a;

  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  // memory & data type
  a.print = function (n = HEAD_LEN) {
    return console.log(this.toString());
  };
  defineGetter('dtype', function () {
    const match = dtypeRegex.exec(this.constructor.name);
    return match[1].slice(0, 1).toLocaleLowerCase() + match[2];
  });
  a.clone = function (dtype = null) {
    const newArr = empty(this.length, dtype === null ? this.dtype : dtype);
    newArr.set(this);
    return newArr;
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
  a.head = function (n = HEAD_LEN) {
    return this.subarray(0, n);
  };
  a.tail = function (n = HEAD_LEN) {
    return this.subarray(this.length - n);
  };

  a.concat = function (other) {
    let dtype = 'f64';
    if (this.dtype.slice(0, 1) === other.dtype.slice(0, 1)) {
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

  defineGetter('memory', function () {
    const bytes = this.BYTES_PER_ELEMENT * this.length;
    const bits = bytes * 8;
    const K = 1000;
    const M = 1000 * K;
    const G = 1000 * M;
    return {
      bytes,
      bits,
      Kb: bits / K,
      Mb: bits / M,
      Gb: bits / G,
      KB: bytes / K,
      MB: bytes / M,
      GB: bytes / G,
    };
  });

  a.nLargest = function (n = HEAD_LEN) {
    return this.sort('des').subarray(0, n);
  };
  a.nSmallest = function (n = HEAD_LEN) {
    return this.sort('asc').subarray(0, n);
  };
  a.takeWhile = function (f) {
    let i = 0;
    while (f(this[i]) && i < this.length) i++;
    return this.subarray(0, i);
  };

  a.all = function (f) {
    return !this.some((v, idx, arr) => !f(v, idx, arr));
  };
  a.none = function (f) {
    return !this.some((v, idx, arr) => f(v, idx, arr));
  };
  a.contains = function (v) {
    return this.some(x => x === v);
  };
  a.pop = function (idx) {
    const newArr = empty(this.length - 1, this.dtype);
    newArr.set(this.subarray(0, idx));
    newArr.set(this.subarray(idx + 1), idx);
    return newArr;
  };

  a.add = function (other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x + y, 0);
    }
    const myDtype = this.dtype;
    const amInt = myDtype.match('i');
    const amUint = myDtype.match('u');
    const amFloat = myDtype.match('f');
    const myBits = this.BYTES_PER_ELEMENT * 8;

    if (other.constructor.name === 'Number') {
      if (dtype !== null) {
        return empty(this.length, dtype)
          .map(x => x + other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x + other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, 'i32')
          .map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, 'f64')
          .map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype)
        .map((_, idx) => this[idx] * other[idx]);
    }

    if (other.constructor.name === 'Array') {
      return this.add(from(other));
    }

    // if other is an EnhancedTypedArray
    const isFloat = other.dtype.match('f');
    const isInt = other.dtype.match('i');
    const isUint = other.dtype.match('u');
    const otherBits = other.BYTES_PER_ELEMENT * 8;
    const len = Math.min(this.length, other.length);

    if (isFloat && amFloat) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return this.map((x, idx) => x + other[idx]);
      }
    } else if (amFloat) {
      return this.map((x, idx) => x + other[idx]);
    } else if (isFloat) {
      return other.map((x, idx) => x + this[idx]);
    } else if (amUint && isUint) {
      if (other.BYTES_PER_ELEMENT >= this.BYTES_PER_ELEMENT) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return this.map((x, idx) => x + other[idx]);
      }
    } else if (amInt && isUint) {
      if (myBits >= (otherBits * 2)) {
        return this.map((x, idx) => x + other[idx]);
      } else {
        return empty(len, 'i32')
          .map((_, idx) => this[idx] + other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`)
          .map((_, idx) => this[idx] + other[idx]);
      }
    }
    return empty(len, 'f64')
      .map((_, idx) => this[idx] * other[idx]);
  };

  a.sub = function (other = null, dtype = null) {
    if (other === null) {
      return this.reduce((x, y) => x - y);
    } else if (other.constructor.name === 'Number') {
      if (this.dtype.startsWith('f')) {
        return this.map(x => x - other);
      } else if (Number.isInteger(other)) {
        return empty(this.length, 'i32').map((_, idx) => this[idx] - other);
      } else {
        return empty(this.length, 'f64').map((_, idx) => this[idx] - other);
      }
    } else {
      return this.add(other.mul(-1, dtype), dtype);
    }
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

    if (other.constructor.name === 'Number') {
      if (dtype !== null) {
        return empty(this.length, dtype)
          .map(x => x * other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x * other);
      } else if (amUint && isInt && isNeg) {
        return empty(this.length, `i32`)
          .map((_, idx) => this[idx] * other);
      } else {
        return empty(this.length, 'f64')
          .map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype)
        .map((_, idx) => this[idx] * other[idx]);
    }

    if (other.constructor.name === 'Array') {
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
        return empty(len, 'i32')
          .map((_, idx) => this[idx] * other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return empty(len, `Int${Math.min(32, otherBits * 2)}`)
          .map((_, idx) => this[idx] * other[idx]);
      }
    }
    return empty(len, 'f64')
      .map((_, idx) => this[idx] * other[idx]);
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
      return empty(this.length, 'f64')
        .map((_, idx) => this[idx] / other);
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return empty(this.length, dtype)
        .map((_, idx) => this[idx] / other[idx]);
    }

    if (other.constructor.name === 'Array') {
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
    return empty(len, 'f64')
      .map((_, idx) => this[idx] / other[idx]);
  };

  // basic ops
  a.abs = function () {
    const { dtype } = this;
    if (dtype.startsWith('i')) {
      return this.cast(`u${Math.min(32, this.BYTES_PER_ELEMENT * 8 * 2)}`);
    } else {
      return this.map(x => Math.abs(x));
    }
  };

  a.round = function () {
    return this.map(x => Math.round(x));
  };

  a.trunc = function () {
    return this.map(x => Math.trunc(x));
  };

  a.floor = function () {
    return this.map(x => Math.floor(x));
  };

  a.ceil = function () {
    return this.map(x => Math.ceil(x));
  };
  a.pow = function (n, dtype = null) {
    if (n === 0) {
      return ones(this.length);
    } else if (n === 1) {
      return this.clone(dtype);
    } else if (dtype === null) {
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


  // // spread
  a.mean = function () {
    return this.add() / this.length;
  };
  a.var = function (dtype = null) {
    return this.sub(this.mean(), dtype).square(dtype).mean();
  };
  a.mad = function (dtype = null) {
    return this.sub(this.mean(), dtype).abs().mean();
  };
  a.stdev = function (dtype = null) {
    return Math.sqrt(this.var(dtype));
  };
  a.max = function () {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.max(v1, v2));
  };
  a.min = function () {
    if (this.length === 1) return this[0];
    else return this.reduce((v1, v2) => Math.min(v1, v2));
  };
  a.range = function () {
    return this.max() - this.min();
  };
  // // central tendency
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
  a.IQR = function () {
    return this.Q3() - this.Q1();
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

  // linear algebra
  a.magnitude = function () {
    return Math.sqrt(this.square().add());
  };
  a.dot = function (other) {
    return this.mul(other).add();
  };

  /*
   * a.minkDist = function (other, p = 2) {
   *   if (this.dtype.indexOf('Float') >= 0) {
   *     return (this.diff(other).map(x => Math.abs(x) ** p).sum) ** (1 / p);
   *   } else {
   *     return (cast(this, 'Float64').subP(other).map(x => Math.abs(x) ** p).sum) ** (1 / p);
   *   }
   * };
   * a.euclDist = function (other) {
   *   if (this.dtype.indexOf('f') >= 0) {
   *     return Math.sqrt(this.sub(other).square().add());
   *   } else {
   *     return Math.sqrt(cast(this, 'Float64').subP(other).map(x => x ** 2).sum);
   *   }
   * };
   * a.manhDist = function (other) {
   *   if (this.dtype.indexOf('Float') >= 0) {
   *     this.map((x, idx) => Math.abs(x - other[idx])).sum;
   *   } else {
   *     return cast(this, 'Float64').map((x, idx) => Math.abs(x - other[idx])).sum;
   *   }
   * };
   */

  a.cast = function (toDtype) {
    if (toDtype === this.dtype) {
      return this;
    }
    const newArr = empty(this.length, toDtype);
    newArr.set(this);
    return newArr;
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
    const sample = empty(n, 'f64');
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
  a.clip = function (lBound = null, uBound = null) {
    if (lBound !== null && uBound !== null) {
      return this.map(v => (v < lBound ? lBound : v > uBound ? uBound : v));
    } else if (lBound !== null) {
      return this.map(v => v < lBound ? lBound : v);
    } else {
      return this.map(v => v > uBound ? uBound : v);
    }
  };
  a.dropOutliers = function () {
    const Q1 = this.Q1();
    const Q3 = this.Q3();
    return this.filter(x => x >= Q1 && x <= Q3);
  };

  // hacks
  a._slice = a.slice;
  a.slice = function (a, b) {
    return enhanceTypedArray(this._slice(a, b));
  };

  a._subarray = a.subarray;
  a.subarray = function (a, b) {
    return enhanceTypedArray(this._subarray(a, b));
  };


  a._map = a.map;
  a.map = function (f) {
    return enhanceTypedArray(this._map(f));
  };

  a._filter = a.filter;
  a.filter = function (f) {
    return enhanceTypedArray(this._filter(f));
  };

  // functional programming
  a.zipWith = function (other, f, dtype = null) {
    return empty(this.length, dtype === null ? 'f64' : dtype).map((_, idx) => f(this[idx], other[idx]));
  };
  a.zipWith3 = function (xs, ys, f, dtype = null) {
    return empty(this.length, dtype === null ? 'f64' : dtype).map((_, idx) => f(this[idx], xs[idx], ys[idx]));
  };

  a.skewness = function () {
    const meanDiffs = this.sub(this.mean());
    return meanDiffs.cube().mean() / (1 / (this.length - 1) * meanDiffs.square()) ** (3 / 2);
  };

  // FIXME correlation
  // a.correlation = function (ys) {
    // const muX = this.mean();
    // const muY = ys.mean();
    // const diffXSMu = this.sub(muX);
    // const diffYSMu = ys.sub(muY);
    // return diffXSMu.map((diff, idx) => diff * diffYSMu[idx]) / Math.sqrt(diffXSMu.square()) * Math.sqrt(diffYSMu.square());
  // };

  a.downcast = function () {
    const guess = guessDtype(this);
    if (guess === this.dtype) return this;
    const newArr = empty(this.length, guess);
    newArr.set(this);
    return newArr;
  };

  return a;
}

/**
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dtype
 * @returns {Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Int8ArrayConstructor|Int16ArrayConstructor|Int32ArrayConstructor|Float32ArrayConstructor|Float64ArrayConstructor} constructor
 */
function constFromDtype(dtype) {
  const match = dtypeRegex.exec(dtype);
  const nBits = match[2];
  const prefix = match[1].toLocaleLowerCase();
  let type;
  if (prefix.startsWith('f')) {
    type = 'Float';
  } else if (prefix.startsWith('u')) {
    type = 'Uint';
  } else if (prefix.startsWith('i')) {
    type = 'Int';
  }
  return eval(`${type}${nBits}Array`);
}

/**
 * @param {!Number} [len]
 * @param {"u64"|"u32"|"u16"|"u8"|"i64"|"i32"|"i16"|"i8"|"f64"|"f32"|null} dtype
 * @returns {!TypedArray}
 */
function empty(len, dtype = null) {
  if (dtype === null) {
    return empty(len, 'f64');
  }
  const match = dtypeRegex.exec(dtype);
  const bytesNeeded = parseInt(match[2]) / 8;
  const constructor = constFromDtype(dtype);
  return enhanceTypedArray(new constructor(new ArrayBuffer(bytesNeeded * len)));
}

/**
 * @param {!Number} n
 * @param {?Number} a
 * @param {?Number} b
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} rand array
 */
function rand(n, a = null, b = null, dtype = null) {
  if (a === null) {
    return rand(n, 0, b);
  } else if (b === null) {
    return rand(n, a, a + 1);
  } else if (dtype !== null) {
    return empty(n, dtype).map(_ => randInRange(a, b));
  } else {
    return empty(n, 'f64').map(_ => randInRange(a, b));
  }
}

/**
 * @param {!Number} len
 * @param {!Number} val
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} array filled with value
 */
function fill(len, val, dtype = null) {
  return empty(len, dtype === null ? guessDtype([val]) : dtype).fill(val);
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
  return empty(len, dtype === null ? 'u8' : dtype);
}

/**
 * @param xs
 * @returns {!Array<*>|!TypedArray} array
 */
function of(...xs) {
  return from(xs);
}

const Series = {
  rangeIter,
  range,
  fill,
  of,
  empty,
  guessDtype,
  ones,
  rand,
  from,
  zeros,
  bag,
  constFromDtype,
};

module.exports = Series;
