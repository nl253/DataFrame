const isNumRegex = /^(\d+\.?\d*|\d*\.\d+)$/g;
const bitsRegex = /(64|32|16|8)/;

/**
 * @param {!Number} a min val
 * @param {!Number} [b] max val
 * @returns {!Number} random number
 */
function randInRange(a, b) {
  return b === undefined
    ? randInRange(0, a)
    : a + (b - a) * Math.random();
}

/**
 * @param {!Number} a min val
 * @param {!Number} [b] max val
 * @returns {!Number} random number
 */
function randInt(a, b) {
  return Math.floor(randInRange(a, b));
}

/**
 * @param {!Number} [n] #elems
 * @param {!Number} [min] min val
 * @param {!Number} [max] max val
 * @returns {!Array<Number>} array
 */
function randArr(n = 100, min = 0, max = 1) {
  return Array(n).fill(0).map(_ => randInRange(min, max));
}

/**
 * @param {!Array<*>} xs
 * @returns {*} element
 */
function randArrEl(xs) {
  return xs[Math.floor(randInRange(0, xs.length))];
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @param {!Number} n
 * @returns {!TypedArray|!Array<*>} sample
 */
function sampleWOR(xs, n) {
  if (n === null) return sampleWOR(xs, xs.length);
  if (xs.constructor.name === 'Array') {
    const newArr = [];
    while (newArr.length < n) {
      const idx = Math.floor(Math.random() * xs.length);
      newArr.push(xs[idx]);
    }
    return newArr;
  } else {
    const sample = getTypedArray(n, 'Float64');
    const used = new Set();
    for (let ptr = 0; ptr < n; ptr++) {
      let idx;
      do {
        idx = Math.floor(Math.random() * xs.length);
      } while (used.has(idx));
      sample[ptr] = xs[idx];
      used.add(idx);
    }
    return sample;
  }
}

/**
 * @param {Array<!Number>} xs
 * @param {!Number} n
 * @returns {*}
 */
function sampleWR(xs, n) {
  if (n === null) {
    return Array.from(xs);
  }
  return xs.slice(0, n).map(_ => xs[randInt(0, xs.length)]);
}

/**
 * @param {!Number} [n] #rows
 * @param {!Number} [m] #cols
 * @param {!Number} [min] min val
 * @param {!Number} [max] max val
 * @returns {!Array<!Array<!Number>>} array
 */
function randMatrix(n = 32, m = 32, min = 0, max = 1) {
  return Array(n).fill(0).map(_ => randArr(m, min, max));
}

/**
 * @param {!Number} [n]
 * @returns {!String} bit string
 */
function randBitStr(n = 32) {
  return randArr(n, 0, 1).map(v => Math.round(v)).join('');
}

/**
 * @param {!Number} maxBits
 * @returns {!Number} candidate
 */
function randCandidate(maxBits = 32) {
  return Math.floor(randInRange(0, 2 ** maxBits - 1));
}

/**
 * @param {!Number} n
 * @returns {!Number}
 */
function factorial(n) {
  let acc = 1;
  while (n > 0) {
    acc *= n;
    n--;
  }
  return acc;
}

/**
 * @param {!Array<String>} words
 * @param {!Number} [n] len of vector
 * @returns Array<Number> count vector
 */
function hashingTrick(words, n = 100) {
  const counts = Array(n).fill(0);
  for (const s of words) {
    counts[(s.split('').reduce((a, b) => {
      a = ((a << 5) - a) + b.charCodeAt(0);
      return a & a;
    }, 0) % n)]++;
  }
  return counts;
}

/**
 * @param {!String} s
 * @returns {!Number}
 */
function hashStr(s) {
  let hash = 0;
  if (s.length === 0) return hash;
  for (let i = 0; i < s.length; i++) {
    hash = ((hash << 5) - hash) + s.charCodeAt(i);
    hash |= 0; // convert to 32bit integer
  }
  return hash;
}

/**
 * @param {!Number} p probability in [0, 1]
 * @returns {Number|Infinity}
 */
function information(p = 0.5) {
  return Math.log2(1 / p);
}

/**
 * @param {!Array<!Number>|!TypedArray} ps
 * @returns {!Number} entropy
 */
function entropy(ps) {
  return -sum(ps.map(p => p * Math.log2(p)));
}

/**
 *
 * @param {!Number} [a]
 * @param {!Number} [b]
 * @param {!Number} [step]
 */
function* rangeIter(a = 0, b, step = 1) {
  if (b === undefined) {
    yield *rangeIter(0, a, step);
  }
  for (let i = a; i < b; i += step) yield i;
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @param {?Array<*>|!TypedArray} [vocab]
 * @returns {Map<Number>} multiset
 */
function bag(xs, vocab = null) {
  if (vocab !== null) {
    const v = new Set(vocab);
    return bag(xs.filter(x => v.has(x)));
  }
  const b = new Map();
  for (const x of xs) b.set(x, (b.get(x) || 0) + 1);
  return b;
}

/**
 * @param {!Array<*>|!TypedArray} votes
 * @returns {*}
 */
function majorityVote(votes) {
  const b = bag(votes);
  if (b.size === 1) {
    return b.entries().next().value[0];
  }
  // console.log(b);
  const tmp = Array.from(b.entries()).sort((a, b) => (a[1] > b[1] ? -1 : a[1] < b[1] ? 1 : 0));
  // console.log(tmp);
  return tmp[0][0];
}

/**
 * @param {!Array<*>|!TypedArray} args
 * @param {!Function} f
 * @returns {*} arg
 */
function argMax(args, f) {
  let best = args[0];
  let bestScore = f(best);
  if (args.constructor.name === 'Array') {
    for (const a of args.slice(1, args.length)) {
      const score = f(a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
  } else {
    for (const a of args.subarray(1, args.length)) {
      const score = f(a);
      if (score > bestScore) {
        bestScore = score;
        best = a;
      }
    }
  }
  return best;
}

/**
 * @param {!Array<*>|!TypedArray} args
 * @param {!Function} f
 * @returns {Number} arg
 */
function argMin(args, f) {
  let best = args[0];
  let bestScore = f(best);
  if (args.constructor.name === 'Array') {
    for (const a of args.slice(1, args.length)) {
      const score = f(a);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
  } else {
    for (const a of args.subarray(1, args.length)) {
      const score = f(a);
      if (score < bestScore) {
        bestScore = score;
        best = a;
      }
    }
  }
  return best;
}

/**
 * @param {!Function} f
 * @param {!Function} fPrime
 * @param {!Number} [guess]
 * @returns {Number}
 */
function newtonsMethod(f, fPrime, guess) {
  if (guess === undefined) {
    return newtonsMethod(f, fPrime, Math.random());
  }
  while (true) {
    const newGuess = guess - f(guess) / fPrime(guess);
    if (guess === newGuess) return guess;
    else guess = newGuess;
  }
}

/**
 * @param {Array<*>} xs
 * @param {!Number} n
 */
function* combinations(xs, n) {
  if (n === 1) {
    for (const x of xs) yield [x];
    return;
  }
  for (let i = 0; i < xs.length; i++) {
    const prefix = [xs[i]];
    for (const subCombo of combinations(xs.slice(i + 1), n - 1)) {
      yield prefix.concat(subCombo);
    }
  }
}

/**
 * @param {Array<*>} xs
 */
function* permutations(xs, n) {
  if (n === undefined) n = xs.length;
  if (n === 1) {
    yield xs;
    return;
  }

  yield *permutations(xs, n - 1);

  for (let i = 0; i < n - 1; i++) {
    if (n % 2 === 0) {
      swap(xs, i, n - 1);
    } else {
      swap(xs, 0, n - 1);
    }
    yield *permutations(xs, n - 1);
  }
}

/**
 * @param {!Number} n
 * @param {!Number} k
 * @returns {!Number} number of combinations
 */
function nCombinations(n, k) {
  return factorial(n) / (factorial(n - k) * factorial(k));
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function product(xs) {
  return xs.reduce((v1, v2) => v1 * v2, 1);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function quotient(xs) {
  return xs.reduce((v1, v2) => v1 / v2, 1);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function sum(xs) {
  return xs.reduce((v1, v2) => v1 + v2, 0);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function difference(xs) {
  return xs.reduce((v1, v2) => v1 - v2, 0);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!TypedArray}
 */
function add(xs, ys) {
  return elementWise(xs, ys, (a, b) => a + b);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!TypedArray}
 */
function subtract(xs, ys) {
  return elementWise(xs, ys, (a, b) => a - b);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!TypedArray}
 */
function multiply(xs, ys) {
  return elementWise(xs, ys, (a, b) => a * b);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!TypedArray}
 */
function divide(xs, ys) {
  return elementWise(xs, ys, (a, b) => a / b);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @param {!Function} f
 * @returns {!Array<*>|!TypedArray}
 */
function elementWise(xs, ys, f) {
  const l = Math.min(xs.length, ys.length);
  const newArr = getTypedArray(l);
  for (let i = 0; i < l; i++) {
    newArr[i] = f(xs[i], ys[i]);
  }
  return newArr;
}

/**
 * @param {!Array<String>|!TypedArray} xs
 * @param {!Array<String>|!TypedArray} ys
 * @returns {!Number} dot product
 */
function dot(xs, ys) {
  return sum(multiply(xs, ys));
}

/**
 * @param {!Array<!Number>|!TypedArray} nums
 * @returns {!Number}
 */
function mean(nums) {
  return sum(nums) / nums.length;
}

/**
 * @param {!Array<!Number>|!TypedArray} nums non-empty array of nums
 * @returns {Number}
 */
function variance(nums) {
  const mu = mean(nums);
  return mean(nums.map(x => (x - mu) ** 2));
}

/**
 * @param {!Array<!Number>|!TypedArray} nums non-empty array of nums
 * @returns {Number}
 */
function stdev(nums) {
  return Math.sqrt(variance(nums));
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!Number}
 */
function correlation(xs, ys) {
  if (xs.constructor.name === 'Array') {
    return correlation(toTypedArray(xs), ys);
  } else if (ys.constructor.name === 'Array') {
    return correlation(xs, toTypedArray(ys));
  }
  const muX = mean(xs);
  const muY = mean(ys);
  const diffXSMu = xs.map(x => x - muX);
  const diffYSMu = ys.map(y => y - muY);
  return diffXSMu.map((diff, idx) => diff * diffYSMu[idx]) / Math.sqrt(diffXSMu.map(diff => diff ** 2)) * Math.sqrt(diffYSMu.map(diff => diff ** 2));
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {*} mode
 */
function mode(xs) {
  if (xs.length === 1) return xs[0];

  const counts = Array.from(bag(xs).entries()).map(([s, count]) => [s, count]);

  if (counts.length === 1) {
    return counts[0][0];
  }

  return counts.reduce(([val1, count1], [val2, count2]) => (count2 > count1
    ? [val2, count2]
    : [val1, count1]))[0];
}

/**
 * @param {!Array<!Number>} xs
 * @returns {!Number} mean abs deviation
 */
function mad(xs) {
  const mu = mean(xs);
  return mean(xs.map(x => Math.abs(x - mu)));
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number} median
 */
function median(xs) {
  return nQuart(xs, 1, 2);
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Number} [n]
 * @param {!Number} [m]
 * @returns {!Number} nth quartile
 */
function nQuart(xs, n = 2, m = 4) {
  const ys = clone(xs).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0));
  if ((ys.length * n / m) % 1 !== 0) {
    return ys[Math.floor(ys.length * n / m)];
  }
  const middle = ys.length * n / m;
  return (ys[middle] + ys[middle - 1]) / 2;
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function min(xs) {
  if (xs.length === 1) return xs[0];
  else return xs.reduce((v1, v2) => Math.min(v1, v2));
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Number}
 */
function max(xs) {
  if (xs.length === 1) return xs[0];
  else return xs.reduce((v1, v2) => Math.max(v1, v2));
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!Number}
 */
function skewness(xs) {
  const mu = mean(xs);
  const meanDiffs = xs.map(x => (x - mu));
  return mean(meanDiffs.map(x => x ** 3)) / (1 / (xs.length - 1) * meanDiffs.map(x => x ** 2)) ** (3 / 2);
}

/**
 * @param {!Array<Number>} xs
 * @returns {{min: Number, max: Number}}
 */
function range(xs) {
  return max(xs) - min(xs);
}

/**
 * @param {!Array<!Number>|!TypedArray} column
 * @returns {!Array<!Number>|!TypedArray} normalized column
 */
function normalize(column) {
  const smallest = min(column);
  const largest = max(column);
  let newArr;
  if (column.constructor.name === 'Array') {
    newArr = Array.from(column);
  } else {
    // for typed arrays
    newArr = getTypedArray(column.length);
  }
  for (let i = 0; i < column.length; i++) {
    newArr[i] = (column[i] - smallest) / (largest - smallest);
  }
  return newArr;
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @param {!Number} i
 * @param {!Number} j
 */
function swap(xs, i, j) {
  const save = xs[i];
  xs[i] = xs[j];
  xs[j] = save;
}

/**
 * @param {!TypedArray|!Array<*>} arr
 * @returns {!TypedArray} array
 */
function unique(arr) {
  return toTypedArray(Array.from(new Set(arr)));
}

/**
 * Shuffles array in place.
 *
 * @param {!Array<*>|!TypedArray} a items An array containing the items.
 */
function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
}

/**
 * @param {!Array<String>|!TypedArray} col
 * @returns {!Boolean}
 */
function allNums(col) {
  return !col.find(val => !val.match(isNumRegex));
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

/**
 *
 * @param {!Number} [a]
 * @param {!Number} [b]
 * @param {!Number} [step]
 * @returns {!TypedArray<Number>} range
 */
function arange(a = 0, b = null, step = 1) {
  if (b === null) return arange(0, a);
  const newArr = getTypedArray((b - a) / step, guessDtype([b - step, a + step]));
  let i = 0;
  for (const n of rangeIter(a, b, step)) {
    newArr[i] = n;
    i++;
  }
  return newArr;
}

/**
 * @param {!Array<*>|!TypedArray} xs
 * @returns {!Array<*>|!TypedArray} clone
 */
function clone(xs) {
  if (xs.constructor.name === 'Array') return Array.from(xs);
  const newArr = getTypedArray(xs.length, xs.constructor.name.replace('Array', ''));
  newArr.set(xs);
  return newArr;
}

/**
 * @param {!Array<Array<*>>|!Array<*>} xs
 * @param {!Number} min
 * @param {!Number} max
 * @returns {!Array<Array<*>>|!Array<*>}
 */
function clip(xs, min, max = Infinity) {
  return clone(xs).map(v => (v < min ? min : v > max ? max : v));
}

/**
 * @param {!Array<!Number>} xs
 * @param {!Array<!Number>} ys
 * @returns {!Number} mean squared error
 */
function mse(xs, ys) {
  return mean(xs.map((v, idx) => (v - ys[idx]) ** 2));
}

/**
 * @param {!Array<!Number>} xs
 * @param {!Array<!Number>} ys
 * @returns {!Number} mean absolute error
 */
function mae(xs, ys) {
  return mean(xs.map((v, idx) => Math.abs(v - ys[idx])));
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @returns {!Array<!Number>|!TypedArray} safe common dtype
 */
function cumOp(xs, f) {
  if (xs.length === 0) return xs;
  const newArr = getTypedArray(xs.length);
  newArr[0] = xs[0];
  if (xs.length === 1) return newArr;
  if (xs.constructor.name === 'Array') {
    for (let i = xs.length - 1; i >= 0; i--) {
      newArr[i] = f(xs.subarray(0, i + 1));
    }
  } else {
    for (let i = xs.length - 1; i >= 0; i--) {
      newArr[i] = f(xs.slice(0, i + 1));
    }
  }
  return newArr;
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {"sum"|"product"|"min"|"max"|"variance"|"stdev"|"majorityVote"|"mad"|"mean"|"mode"} functName
 * @returns {!Array<!Number>|!TypedArray} array
 */
function cum(xs, functName) {
  return cumOp(xs, eval(functName));
}

/**
 * @param {!String} alias
 * @returns {!String|never}
 */
function getDtypeName(alias) {
  const bits = bitsRegex.exec(alias)[0];
  if (alias.match(/^u(int)64?/i)) {
    return `BigUint64`;
  } else if (alias.match(/^i(nt)64?/i)) {
    return `BigInt64`;
  } else if (alias.match(/^i(nt)?/i)) {
    return `Int${bits}`;
  } else if (alias.match(/^u(int)?/i)) {
    return `Uint${bits}`;
  } else if (alias.match(/^f(loat)?/i)) {
    return `Float${bits}`;
  } else throw new Error(`unrecognised dtype ${alias}`);
}

/**
 * @param {!TypedArray|!Array<*>} arr
 * @param {"BigUint64"|"Uint32"|"Uint16"|"Uint8"|"BigInt64"|"Int32"|"Int16"|"Int8"|"Float64"|"Float32"} toDtype
 * @returns {!TypedArray}
 */
function cast(arr, toDtype = null) {
  if (toDtype === null) {
    if (arr.constructor.name.indexOf('Array') < 0) {
      return downCast(arr);
    } else {
      return cast(arr, 'Float64');
    }
  }
  const newArr = getTypedArray(arr.length, getDtypeName(toDtype));
  newArr.set(arr);
  return newArr;
}

/**
 * @param {!TypedArray} xs
 * @returns {!TypedArray}
 */
function downCast(xs) {
  const a = getTypedArray(xs.length, guessDtype(xs));
  a.set(xs);
  return a;
}

/**
 * @param {!Array<!Number>|!TypedArray} xs
 * @param {!Array<!Number>|!TypedArray} ys
 * @returns {!String} safe common dtype
 */
function unifyDtype(xs, ys) {
  const largest = Math.max(
    max(xs.map(x => Math.abs(x))),
    max(ys.map(y => Math.abs(y))),
  );

  const smallest = Math.min(min(xs), min(ys));
  const isNeg = smallest < 0;
  const bitsNeeded = Math.ceil(Math.log2(largest));
  const isFloat = xs.some(x => !Number.isInteger(x)) || ys.some(y => !Number.isInteger(y));
  if (isFloat) {
    return `Float${largest >= 1.2 * 10 ** (38)}` ? '64' : '32';
  }

  // if neg int
  if (isNeg) {
    if (bitsNeeded <= 8) return 'Int16';
    else if (bitsNeeded <= 16) return 'Int32';
    else return 'BigInt64';
  }

  // if pos int
  if (bitsNeeded <= 8) return 'Uint8';
  else if (bitsNeeded <= 16) return 'Uint16';
  else if (bitsNeeded <= 32) return 'Uint32';
  else return 'BigUint64';
}

function guessDtype(xs) {
  const largest = max(xs);
  const smallest = min(xs);
  const isNeg = smallest < 0;
  const bitsNeeded = Math.log2(largest);
  const isFloat = xs.some(x => !Number.isInteger(x));
  if (isFloat) {
    return 'Float32';
  } else if (isNeg) {
    if (bitsNeeded <= 8) return 'Int16';
    else if (bitsNeeded <= 16) return 'Int32';
    else return 'BigInt64';
  } else if (bitsNeeded <= 8) return 'Uint8';
  else if (bitsNeeded <= 16) return 'Uint16';
  else if (bitsNeeded <= 32) return 'Uint32';
  else return 'BigUint64';
}

/**
 * @param {!Array<!Number>|!Array<String>} xs
 * @returns {!TypedArray|!Array<String>} typed array
 * @param {"BigUint64"|"Uint32"|"Uint16"|"Uint8"|"BigInt64"|"Int32"|"Int16"|"Int8"|"Float64"|"Float32"} defaultDtype
 */
function toTypedArray(xs, defaultDtype = 'Float64') {
  // return empty arrays
  if (xs.length === 0) return xs;
  else if (xs[0].constructor.name === 'String') {
    // parse string cols that are actually nums
    if (allNums(xs)) xs = xs.map(parseFloat);
    // but return string cols that aren't nums
    else return xs;
  } else if (xs.constructor.name.indexOf('Array') >= 0 && xs.constructor.name !== 'Array') {
    // return typed arrays unchanged
    return xs;
  }
  const view = getTypedArray(xs.length, guessDtype(xs));
  view.set(xs);
  return view;
}

/**
 * @param {!TypedArray} a
 * @returns {!TypedArray} the array
 */
function enhanceTypedArray(a) {
  const defineGetter = (name, f) => Object.defineProperty(a, name, { get: f });

  // memory & data type
  a.print = function () { return console.table(Array.from(this.subarray(0, 10))); };
  defineGetter('dtype', function () { return this.constructor.name.replace('Array', ''); });
  defineGetter('clone', function () { return clone(this); });
  defineGetter('isEmpty', function () { return this.length === 0; });
  defineGetter('unique', function () { return unique(this); });
  a.swap = function (i, j) {
    swap(this, i, j);
    return this;
  };

  // manipulation, views and slices
  defineGetter('tail', function (n = 10) { return this.subarray(this.length - n, this.length); });
  defineGetter('head', function (n = 10) { return this.subarray(0, n); });

  a.concat = function (other) {
    const newArr = getTypedArray(this.length + other.length);
    newArr.set(this);
    newArr.set(other, this.length);
    return newArr;
  };

  defineGetter('sortedAsc', function () { return clone(this).sort((a, b) => (a > b ? 1 : a < b ? -1 : 0)); });
  defineGetter('sortedDes', function () { return clone(this).sort((a, b) => (a > b ? -1 : a < b ? 1 : 0)); });

  defineGetter('reversed', function () { return clone(this).reverse(); });
  defineGetter('shuffled', function () {
    const a = clone(this);
    shuffle(a);
    return a;
  });

  a.nLargest = function (n = 10) { return this.sortedDes.slice(0, n); };
  a.nSmallest = function (n = 10) { return this.sortedAsc.slice(0, n); };
  a.takeWhile = function (f) {
    let i = 0;
    while (f(this[i]) && i < this.length) i++;
    return this.slice(0, i);
  };

  a.all = function (f) { return !this.some((v, idx, arr) => !f(v, idx, arr)); };
  a.none = function (f) { return !this.some((v, idx, arr) => f(v, idx, arr)); };
  a.contains = function (v) { return this.some(x => x === v); };
  a.pop = function (idx) {
    const newArr = getTypedArray(this.length - 1, this.constructor.name.replace('Array', ''));
    newArr.set(this.subarray(0, idx));
    newArr.set(this.subarray(idx + 1), idx);
    return newArr;
  };

  // arithmetic on self
  defineGetter('prod', function () { return product(this); });
  defineGetter('quot', function () { return quotient(this); });
  defineGetter('sum', function () { return sum(this); });
  defineGetter('diff', function () { return difference(this); });

  // pair-wise arithmetic on other
  a.addP = function (other) { return add(this, other); };
  a.subP = function (other) { return subtract(this, other); };
  a.mulP = function (other) { return multiply(this, other); };
  a.divP = function (other) { return divide(this, other); };
  a.add = function (v) {
    if (Number.isInteger(v) || this.dtype.indexOf('Float') >= 0) {
      return this.map(x => x + v);
    } else {
      return cast(this, 'Float64').map(x => x + v);
    }
  };
  a.sub = function (v) { return this.sub(-v); };
  a.mul = function (r) { return this.scale(r); };
  a.div = function (r) { return this.scale(1/r); };

  // basic ops
  defineGetter('abs', function () { return this.map(x => Math.abs(x)); });
  defineGetter('round', function () { return this.map(x => Math.round(x)); });
  defineGetter('trunc', function () { return this.cast('Int32'); });

  a.argMax = function (f) { return argMax(this, f); };
  a.argMin = function (f) { return argMin(this, f); };

  // stats
  a.cum = function (op) { return cumOp(this, eval(op)); };
  // // spread
  defineGetter('stdev', function () { return stdev(this); });
  defineGetter('var', function () { return variance(this); });
  defineGetter('mad', function () { return mad(this); });
  defineGetter('min', function () { return min(this); });
  defineGetter('max', function () { return max(this); });
  defineGetter('range', function () { return range(this); });
  // // central tendency
  defineGetter('median', function () { return median(this); });
  defineGetter('Q1', function () { return nQuart(this, 1, 4); });
  defineGetter('Q3', function () { return nQuart(this, 3, 4); });
  defineGetter('mean', function () { return mean(this); });
  defineGetter('mode', function () { return mode(this); });
  // // shape of data
  defineGetter('skew', function () { return skewness(this); });
  a.correlation = function (other) { return correlation(this, other); };

  // // sampling
  a.sample = function (r, wr = false) {
    const n = Math.floor(this.length * r);
    return toTypedArray(wr ? sampleWR(this, n) : sampleWOR(this, n));
  };

  // linear algebra
  a.dot = function (other) { return dot(this, other); };
  a.scale = function (r) {
    if (Number.isInteger(r) || this.dtype.indexOf('Float') >= 0) {
      return this.map(x => x * r);
    } else {
      return cast(this, 'Float64').map(x => x * r);
    }
  };
  defineGetter('magnitude', function () {
    if (this.dtype.indexOf('Float') < 0) {
      return Math.sqrt(sum(cast(this, 'Float64').map(x => x ** 2)));
    } else {
      return Math.sqrt(sum(this.map(x => x ** 2)));
    }
  });
  a.minkDist = function (other, p = 2) {
    if (this.dtype.indexOf('Float') >= 0) {
      return (this.subP(other).map(x => Math.abs(x) ** p).sum)**(1/p);
    } else {
      return (cast(this, 'Float64').subP(other).map(x => Math.abs(x) ** p).sum)**(1/p);
    }
  };
  a.euclDist = function (other) {
    if (this.dtype.indexOf('Float') >= 0) {
      return Math.sqrt(this.subP(other).map(x => x ** 2).sum);
    } else {
      return Math.sqrt(cast(this, 'Float64').subP(other).map(x => x ** 2).sum);
    }
  };
  a.manhDist = function (other) {
    if (this.dtype.indexOf('Float') >= 0) {
      this.map((x, idx) => Math.abs(x - other[idx])).sum;
    } else {
      return cast(this, 'Float64').map((x, idx) => Math.abs(x - other[idx])).sum;
    }
  };

  // pre-processing
  defineGetter('normalized', function () { return normalize(this); });
  defineGetter('counts', function () { return bag(this); });
  a.clip = function (lBound, uBound = Infinity) { return clip(this, lBound, uBound); };
  a.trimOutliers = function (lBound = null, uBound = null) {
    if (lBound !== null) {
      return this.filter(x => x < lBound).trimOutliers(null, uBound);
    }
    if (uBound !== null) {
      return this.filter(x => x > uBound);
    }
  };
  a.drop = function (v) { return this.filter(a => a === v); };
  defineGetter('noInfinity', function () { return this.drop(Infinity); });
  defineGetter('noNaN', function () { return this.drop(NaN); });


  // hacks
  a._slice = a.slice;
  a.slice = function (a, b) { return enhanceTypedArray(this._slice(a, b)); };

  a._subarray = a.subarray;
  a.subarray = function (a, b) { return enhanceTypedArray(this._subarray(a, b)); };

  a._map = a.map;
  a.map = function (a, b, c) { return enhanceTypedArray(this._map(a, b, c)); };

  a._filter = a.filter;
  a.filter = function (a, b, c) { return enhanceTypedArray(this._filter(a, b, c)); };

  // functional programming
  a.zipWith = function (xs, f) { return this.map((y, idx) => f(y, xs[idx])); };
  a.zipWith3 = function (xs, ys, f) { return this.map((v, idx) => f(v, xs[idx], ys[idx])); };

  return a;
}

/**
 * @param {!Number} [len]
 * @param {"BigUint64"|"Uint32"|"Uint16"|"Uint8"|"BigInt64"|"Int32"|"Int16"|"Int8"|"Float64"|"Float32"} dtype
 * @returns {!TypedArray}
 */
function getTypedArray(len, dtype = 'Float64') {
  const match = bitsRegex.exec(dtype);
  const bytesNeeded = parseInt(match[1]) / 8;
  const constructor = eval(`${getDtypeName(dtype)}Array`);
  return enhanceTypedArray(new constructor(new ArrayBuffer(bytesNeeded * len)));
}

module.exports = {
  add,
  arange,
  argMax,
  argMin,
  bag,
  cast,
  clone,
  combinations,
  correlation,
  cum,
  difference,
  divide,
  dot,
  downCast,
  enhanceArray: enhanceTypedArray,
  entropy,
  factorial,
  getTypedArray,
  guessDtype,
  hashStr,
  hashingTrick,
  information,
  isNumCol: allNums,
  mad,
  mae,
  majorityVote,
  max,
  mean,
  median,
  min,
  mode,
  mse,
  multiply,
  nCombinations,
  nQuart,
  newtonsMethod,
  normalize,
  permutations,
  product,
  quotient,
  randArr,
  randArrEl,
  randBitStr,
  randCandidate,
  randInRange,
  randInt,
  randMatrix,
  range,
  rangeIter,
  sampleWOR,
  sampleWR,
  shuffle,
  skewness,
  stdev,
  subtract,
  sum,
  swap,
  toTypedArray,
  transpose,
  unifyDtype,
  unique,
  variance,
};
