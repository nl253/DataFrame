const { randInRange, randInt } = require('./rand');
const dtypeRegex = /([a-z]+)(8|16|32|64)/i;
const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)$/g;

/**
 *
 * @param {!Number} [a]
 * @param {?Number} [b]
 * @param {!Number} [step]
 */
function* rangeIter(a = 0, b = null, step = 1) {
  if (b === null) {
    yield *rangeIter(0, a, step);
  }
  for (let i = a; i < b; i += step) yield i;
}

/**
 * @param {!Array<*>|!TypedArray|!Set<*>} xs
 * @param {?Array<*>|!TypedArray} [vocab]
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

// /**
//  * @param {Array<*>} xs
//  * @param {!Number} n
//  */
// function *combinations(xs, n) {
//   if (n === 1) {
//     for (const x of xs) yield [x];
//     return;
//   }
//   for (let i = 0; i < xs.length; i++) {
//     const prefix = [xs[i]];
//     for (const subCombo of combinations(xs.slice(i + 1), n - 1)) {
//       yield prefix.concat(subCombo);
//     }
//   }
// }

// /**
//  * @param {Array<*>} xs
//  */
// function *permutations(xs, n) {
//   if (n === undefined) n = xs.length;
//   if (n === 1) {
//     yield xs;
//     return;
//   }
//
//   yield *permutations(xs, n - 1);
//
//   for (let i = 0; i < n - 1; i++) {
//     if (n % 2 === 0) {
//       swap(xs, i, n - 1);
//     } else {
//       swap(xs, 0, n - 1);
//     }
//     yield *permutations(xs, n - 1);
//   }
// }

// /**
//  * @param {!Array<!Number>|!TypedArray} xs
//  * @param {!Array<!Number>|!TypedArray} ys
//  * @returns {!Number}
//  */
// function correlation(xs, ys) {
//   if (xs.constructor.name === 'Array') {
//     return correlation(tryConvert(xs), ys);
//   } else if (ys.constructor.name === 'Array') {
//     return correlation(xs, tryConvert(ys));
//   }
//   const muX = mean(xs);
//   const muY = mean(ys);
//   const diffXSMu = xs.map(x => x - muX);
//   const diffYSMu = ys.map(y => y - muY);
//   return diffXSMu.map((diff, idx) => diff * diffYSMu[idx]) / Math.sqrt(diffXSMu.map(diff => diff ** 2)) * Math.sqrt(diffYSMu.map(diff => diff ** 2));
// }

// /**
//  * @param {!Array<*>|!TypedArray} xs
//  * @returns {!Number}
//  */
// function skewness(xs) {
//   const mu = mean(xs);
//   const meanDiffs = xs.map(x => (x - mu));
//   return mean(meanDiffs.map(x => x ** 3)) / (1 / (xs.length - 1) * meanDiffs.map(x => x ** 2)) ** (3 / 2);
// }

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

/**
 *
 * @param {!Number} [a]
 * @param {!Number} [b]
 * @param {!Number} [step]
 * @returns {!TypedArray<Number>} range
 */
function arange(a = 0, b = null, step = 1) {
  if (b === null) return arange(0, a);
  const newArr = malloc((Math.ceil(b - a) / step), guessDtype([b - step, a + step]));
  let i = 0;
  for (const n of rangeIter(a, b, step)) {
    newArr[i] = n;
    i++;
  }
  return newArr;
}

// /**
//  * @param {!Array<!Number>} xs
//  * @param {!Array<!Number>} ys
//  * @returns {!Number} mean squared error
//  */
// function mse(xs, ys) {
//   return mean(xs.map((v, idx) => (v - ys[idx]) ** 2));
// }

// /**
//  * @param {!Array<!Number>} xs
//  * @param {!Array<!Number>} ys
//  * @returns {!Number} mean absolute error
//  */
// function mae(xs, ys) {
//   return mean(xs.map((v, idx) => Math.abs(v - ys[idx])));
// }

// /**
//  * @param {!Array<!Number>|!TypedArray} xs
//  * @returns {!Array<!Number>|!TypedArray} safe common dtype
//  */
// function cumOp(xs, f) {
//   if (xs.length === 0) return xs;
//   const newArr = malloc(xs.length);
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
  const isNeg = smallest < 0;
  const bitsNeeded = Math.log2(largest);
  const isFloat = xs.some(x => !Number.isInteger(x));

  // reals
  if (isFloat) return `f${floatSize}`;

  // integers
  if (isNeg) {
    if (bitsNeeded <= 4) {
      return 'i8';
    } else if (bitsNeeded <= 8) {
      return 'i16';
    } else if (bitsNeeded <= 16) {
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
 * @param {!Array<!Number>|!Array<String>|!TypedArray} xs
 * @returns {!TypedArray|!Array<String>} typed array
 */
function tryConvert(xs) {
  // return empty arrays
  if (xs.length === 0) {
    return xs;
  }

  if (xs[0].constructor.name === 'String') {
    // return string cols that aren't nums
    if (xs.find(val => !val.match(isNumRegex))) {
      return enhanceArray(xs);
    }
    // parse string cols that are actually nums
    xs = xs.map(parseFloat);
  } else if (xs.constructor.name.indexOf('Array') >= 0 && xs.constructor.name !== 'Array') {
    // return typed arrays unchanged
    return xs;
  }
  const view = malloc(xs.length, guessDtype(xs));
  view.set(xs);
  return view;
}

/**
 * @param {!Array<!String>} a
 * @returns {!Array<!String>} the array
 */
function enhanceArray(a) {
  return a;
}

/**
 * @param {!TypedArray} a
 * @returns {!TypedArray} the array
 */
function enhanceTypedArray(a) {
  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  // memory & data type
  a.print = function (n = 10) {
    return console.table(Array.from(this.head(n)));
  };
  defineGetter('isEmpty', function () {
    return this.length === 0;
  });
  defineGetter('dtype', function () {
    const match = dtypeRegex.exec(this.constructor.name);
    return match[1].slice(0, 1).toLocaleLowerCase() + match[2];
  });
  a.clone = function (dtype = null) {
    const newArr = malloc(this.length, dtype === null ? this.dtype : dtype);
    newArr.set(this);
    return newArr;
  };
  a.unique = function () {
    return this.constructor.from(new Set(this));
  };
  a.swap = function (i, j) {
    const save = this[i];
    this[i] = this[j];
    this[j] = save;
    return this;
  };

  // manipulation, views and slices
  a.head = function (n = 10) {
    return this.subarray(0, n);
  };
  a.tail = function (n = 10) {
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
    const newArr = malloc(this.length + other.length, dtype);
    newArr.set(this);
    newArr.set(other, this.length);
    return newArr;
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

  a._reverse = a.reverse;
  a.reverse = function () {
    const cpy = malloc(this.length, this.dtype);
    let j = 0;
    for (let i = this.length - 1; i >= 0; i--) {
      cpy[i] = this[j];
      j++;
    }
    return cpy;
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

  a._shuffle = function () {
    for (let i = this.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [this[i], this[j]] = [this[j], this[i]];
    }
  };

  a.shuffle = function () {
    return this.clone()._shuffle();
  };

  a.nLargest = function (n = 10) {
    return this.sort('des').subarray(0, n);
  };
  a.nSmallest = function (n = 10) {
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
    const newArr = malloc(this.length - 1, this.dtype);
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
        return malloc(this.length, dtype)
          .map(x => x + other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x + other);
      } else if (amUint && isInt && isNeg) {
        return malloc(this.length, 'i32')
          .map((_, idx) => this[idx] * other);
      } else {
        return malloc(this.length, 'f64')
          .map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return malloc(this.length, dtype)
        .map((_, idx) => this[idx] * other[idx]);
    }

    if (other.constructor.name === 'Array') {
      return this.add(tryConvert(other));
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
        return malloc(len, 'i32')
          .map((_, idx) => this[idx] + other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x + this[idx]);
      } else {
        return malloc(len, `Int${Math.min(32, otherBits * 2)}`)
          .map((_, idx) => this[idx] + other[idx]);
      }
    }
    return malloc(len, 'f64')
      .map((_, idx) => this[idx] * other[idx]);
  };

  a.sub = function (other, dtype) {
    return this.add(other.mul(-1, dtype), dtype);
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
        return malloc(this.length, dtype)
          .map(x => x * other);
      }
      const isInt = Number.isInteger(other);
      const isNeg = other < 0;
      if (amFloat || (isInt && (!isNeg || amInt))) {
        return this.map(x => x * other);
      } else if (amUint && isInt && isNeg) {
        return malloc(this.length, `i32`)
          .map((_, idx) => this[idx] * other);
      } else {
        return malloc(this.length, 'f64')
          .map((_, idx) => this[idx] * other);
      }
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return malloc(this.length, dtype)
        .map((_, idx) => this[idx] * other[idx]);
    }

    if (other.constructor.name === 'Array') {
      return this.mul(tryConvert(other));
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
        return malloc(len, 'i32')
          .map((_, idx) => this[idx] * other[idx]);
      }
    } else if (isInt && amUint) {
      if (otherBits >= (myBits * 2)) {
        return other.map((x, idx) => x * this[idx]);
      } else {
        return malloc(len, `Int${Math.min(32, otherBits * 2)}`)
          .map((_, idx) => this[idx] * other[idx]);
      }
    }
    return malloc(len, 'f64')
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
        return malloc(this.length, dtype)
          .map(x => x / other);
      }
      return malloc(this.length, 'f64')
        .map((_, idx) => this[idx] / other);
    }

    // else if other is enhanced array
    if (dtype !== null) {
      return malloc(this.length, dtype)
        .map((_, idx) => this[idx] / other[idx]);
    }

    if (other.constructor.name === 'Array') {
      return this.div(tryConvert(other));
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
    return malloc(len, 'f64')
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

  // basic ops
  a.round = function () {
    return this.map(x => Math.round(x));
  };

  a.trunc = function () {
    return this.map(x => Math.abs(x));
  };

  a.floor = function () {
    return this.map(x => Math.floor(x));
  };

  a.ceil = function () {
    return this.map(x => Math.ceil(x));
  };

  a.argMax = function (f) {
    let best = this[0];
    let bestScore = f(best);
    for (const x of this.subarray(1, this.length)) {
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
    for (const x of this.subarray(1, this.length)) {
      const score = f(x);
      if (score < bestScore) {
        bestScore = score;
        best = x;
      }
    }
    return best;
  };

  a.mean = function () {
    return this.add() / this.length;
  };

  // // spread
  a.var = function (dtype = null) {
    return this.sub(this.mean(), dtype).square(dtype).mean();
  };
  a.pow = function (n, dtype = null) {
    if (n === 0) {
      return ones(this.length);
    } else if (n === 1) {
      return this.clone(dtype);
    } else if (dtype === null) {
      return this.map(x => x ** n);
    } else {
      return malloc(this.length, dtype).map((_, idx) => this[idx] ** n);
    }
  };
  a.square = function (dtype = null) {
    return this.pow(2, dtype);
  };
  a.cube = function (dtype = null) {
    return this.pow(3, dtype);
  };
  a.mad = function (dtype = null) {
    return this.sub(this.mean(), dtype).abs().mean();
  };
  a.std = function (dtype = null) {
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
  a.median = function () {
    return this.nQuart(2, 4);
  };
  a.Q1 = function () {
    return this.nQuart(1, 4);
  };
  a.Q3 = function () {
    return this.nQuart(3, 4);
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
    const newArr = malloc(this.length, toDtype);
    newArr.set(this);
    return newArr;
  };

  a.sample = function (n, wr = true) {
    if (n === null) {
      return this.sample(this.length, wr);
    }
    if (n <= 1) {
      return this.sample(Math.floor(this.length * n), wr);
    }
    if (wr) {
      return this.subarray(0, n).map(_ => this[randInt(0, this.length)]);
    }
    const sample = malloc(n, 'f64');
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

  defineGetter('randEl', function () {
    return this[Math.floor(randInRange(0, this.length))];
  });

  // pre-processing
  a.normalize = function () {
    const smallest = this.min();
    const denominator = this.max() - smallest;
    return malloc(this.length).map((_, idx) => (this[idx] - smallest) / denominator);
  };

  a.dropInfinity = function () {
    return this.drop(Infinity);
  };
  a.dropNaN = function () {
    return this.drop(NaN);
  };
  a.drop = function (v) {
    return this.filter(a => a === v);
  };
  a.clip = function (lBound, uBound) {
    return this.map(v => (v < lBound ? lBound : v > uBound ? uBound : v));
  };
  a.trimOutliers = function (lBound, uBound) {
    if (lBound !== null && uBound !== null) {
      return this.filter(x => x > lBound && x < uBound);
    } else if (lBound !== null) {
      return this.filter(x => x > lBound);
    } else {
      return this.filter(x => x < uBound);
    }
  };

  a.counts = function () { return bag(this); };

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
    return malloc(this.length, dtype === null ? 'f64' : dtype).map((_, idx) => f(this[idx], other[idx]));
  };
  a.zipWith3 = function (xs, ys, f, dtype = null) {
    return malloc(this.length, dtype === null ? 'f64' : dtype).map((_, idx) => f(this[idx], xs[idx], ys[idx]));
  };

  a.downcast = function () {
    const guess = guessDtype(this);
    if (guess === this.dtype) return this;
    const newArr = malloc(this.length, guess);
    newArr.set(this);
    return newArr;
  };

  return a;
}

/**
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"} dtype
 * @returns {Uint8ArrayConstructor|Uint16ArrayConstructor|Uint32ArrayConstructor|Int8ArrayConstructor|Int16ArrayConstructor|Int32ArrayConstructor|Float32ArrayConstructor|Float64ArrayConstructor} constructor
 */
function dTypeConst(dtype) {
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
function malloc(len, dtype = null) {
  if (dtype === null) {
    return malloc(len, 'f64');
  }
  const match = dtypeRegex.exec(dtype);
  const bytesNeeded = parseInt(match[2]) / 8;
  const constructor = dTypeConst(dtype);
  return enhanceTypedArray(new constructor(new ArrayBuffer(bytesNeeded * len)));
}

/**
 * @param {!Number} n
 * @param {?Number} a
 * @param {?Number} b
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} rand array
 */
function randArr(n, a = null, b = null, dtype = null) {
  if (a === null) {
    return randArr(n, 0, b);
  } else if (b === null) {
    return randArr(n, a, a + 1);
  } else if (dtype !== null) {
    return malloc(n, dtype).map(_ => randInRange(a, b));
  } else {
    return malloc(n, 'f64').map(_ => randInRange(a, b));
  }
}

/**
 * @param {!Number} len
 * @param {!Number} val
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|null} dtype
 * @returns {!TypedArray} array filled with value
 */
function fill(len, val, dtype = null) {
  return malloc(len, dtype === null ? guessDtype([val]) : dtype).fill(val);
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
  return malloc(len, dtype === null ? 'u8' : dtype);
}

module.exports = {
  arange,
  fill,
  malloc,
  ones,
  rand: randArr,
  transpose,
  tryConvert,
  zeros,
};
