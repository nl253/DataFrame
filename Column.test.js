/* eslint-disable no-magic-numbers,array-element-newline,no-multi-spaces,array-bracket-spacing,max-lines,array-bracket-newline */
const Column = require('./Column');
const { isMap } = require('./utils');

const FLOAT_DELTA = 0.001;
const LOW_BOUND_INT = 0;
const HIGH_BOUND_INT = 100;
const LOW_BOUND_FLOAT = -100;
const HIGH_BOUND_FLOAT = 100;
const STR_MAX_LEN = 20;

const DTYPES = ['s', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'f64'];

const RAND = {
  float(n = LOW_BOUND_FLOAT, m = HIGH_BOUND_FLOAT) {
    return m === undefined
      ? this.float(0, n)
      : n + Math.random() * (m - n);
  },
  int(n = LOW_BOUND_INT, m = HIGH_BOUND_INT) {
    return Math.floor(this.float(n, m));
  },
  str(n = 0, m = STR_MAX_LEN) {
    const len = this.int(n, m);
    const a = Array(len).fill('');
    for (let i = 0; i < len; i++) {
      a[i] = String.fromCharCode(Math.random() < 0.8 ? this.int(97, 123) : this.int(65, 97));
    }
    return a.join('');
  }
};

/*
 * TODO unit test for `Column.IQR`
 * TODO unit test for `Column.Q1`
 * TODO unit test for `Column.Q3`
 * TODO unit test for `Column.abs`
 * TODO unit test for `Column.all`
 * TODO unit test for `Column.argMax`
 * TODO unit test for `Column.argMin`
 * TODO unit test for `Column.cast`
 * TODO unit test for `Column.ceil`
 * [X]  unit test for `Column.clip`
 * TODO unit test for `Column.clone`
 * TODO unit test for `Column.concat`
 * TODO unit test for `Column.contains`
 * TODO unit test for `Column.counts`
 * TODO unit test for `Column.cube`
 * TODO unit test for `Column.dot`
 * TODO unit test for `Column.downcast`
 * TODO unit test for `Column.drop`
 * TODO unit test for `Column.filter`
 * TODO unit test for `Column.floor`
 * TODO unit test for `Column.head`
 * TODO unit test for `Column.mad`
 * TODO unit test for `Column.magnitude`
 * TODO unit test for `Column.map`
 * TODO unit test for `Column.max`
 * [X]  unit test for `Column.mean`
 * TODO unit test for `Column.median`
 * TODO unit test for `Column.min`
 * TODO unit test for `Column.mode`
 * TODO unit test for `Column.nLargest`
 * TODO unit test for `Column.nQuart`
 * TODO unit test for `Column.nSmallest`
 * TODO unit test for `Column.none`
 * TODO unit test for `Column.normalize`
 * TODO unit test for `Column.pop`
 * TODO unit test for `Column.pow`
 * TODO unit test for `Column.range`
 * TODO unit test for `Column.replace`
 * TODO unit test for `Column.reverse`
 * TODO unit test for `Column.round`
 * TODO unit test for `Column.sample`
 * TODO unit test for `Column.shuffle`
 * TODO unit test for `Column.skewness`
 * TODO unit test for `Column.slice`
 * TODO unit test for `Column.sort`
 * TODO unit test for `Column.square`
 * TODO unit test for `Column.std`
 * TODO unit test for `Column.subarray`
 * TODO unit test for `Column.swap`
 * TODO unit test for `Column.tail`
 * TODO unit test for `Column.takeWhile`
 * TODO unit test for `Column.trimOutliers`
 * TODO unit test for `Column.trunc`
 * TODO unit test for `Column.unique`
 * TODO unit test for `Column.var`
 * TODO unit test for `Column.zipWith`
 * TODO unit test for `Column.zipWith3`
 */

// Tests for Functions

for (const triplet of [
  [[        1,   2],  'u8',  'u8'],
  [[       -1,   2],  'i8',  'i8'],
  [[    -0.99,   2], 'f64', 'f32'],
  [[   2 ** 8,   0], 'u16', 'u16'],
  [[  2 ** 16,   0], 'u32', 'u32'],
  [[-(2 ** 8),   0], 'i16', 'i16'],
  [[           0.8], 'f64', 'f32'],
]) {
  const [arr, dtype, dtype2] = triplet;
  test('correct guesses dtype [-1,2] to be i8 ', () => {
    const guess = Column.guessNumDtype(arr);
    expect(DTYPES).toContain(guess);
    if (dtype === dtype2) {
      expect(guess).toEqual(dtype);
    } else  {
      expect(guess === dtype || guess === dtype2).toEqual(true);
    }
  });
}

for (const pair of [
  [RAND.int(0, 10), RAND.int(10, 100)],
  [RAND.float(0, 10), RAND.float(10, 100)],
  [RAND.float(-10, 10), RAND.float(10, 100)],
]) {
  const [lBound, uBound] = pair;
  const arr = Column.rand(100, lBound, uBound);
  for (let i = 0; i < arr.length; i++) {
    test(`rand generated rand array with nums in range [${lBound}, ${uBound}) has element ${i} (${arr[i]}) in the range`, () => {
      expect(arr[i]).toBeLessThan(uBound);
      expect(arr[i]).toBeGreaterThanOrEqual(lBound);
    });
  }
}

test('inserting 1, 2, 3, 1, 1 into a bag has 1x3, 2x1, 3x1', () => {
  const multiset = Column.bag([1, 2, 3, 1, 1]);
  expect(isMap(multiset)).toBe(true);
  expect(multiset.get(1)).toBe(3);
  expect(multiset.get(2)).toBe(1);
  expect(multiset.get(3)).toBe(1);
});

for (const pair of [
  [RAND.int(0, 10), RAND.int(10, 100), RAND.int(1, 3)],
  [RAND.float(0, 10), RAND.float(10, 100), RAND.float(1, 3)],
  [RAND.float(-10, 10), RAND.float(10, 100), RAND.float(1, 3)],
]) {
  const [lBound, uBound, step] = pair;
  const arr = Column.range(lBound, uBound, step);
  for (let i = 0; i < arr.length; i++) {
    test(`range(${lBound}, ${uBound}) has all element ${lBound} <= ${i}th element (${arr[i]}) < ${uBound}`, () => {
      expect(arr[i]).toBeGreaterThanOrEqual(lBound - FLOAT_DELTA);
      expect(arr[i]).toBeLessThan(uBound + FLOAT_DELTA);
      if (i >= 1) {
        expect(arr[i]).toBeCloseTo(arr[i - 1] + step);
      }
    });
  }
}

for (const input of [
  ['a', 'b'],
  ['a'],
  ['a123'],
  [],
]) {
  test(`Column.from([${input.join(', ')}]) gives a normal array`, () => {
    const col = Column.from(input);
    expect(input).toHaveLength(col.length);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toEqual(input[i]);
    }
  });
}

for (const input of [
  ['0'],
  ['0', '1'],
  Array(RAND.int(1, 100)).fill('').map(() => RAND.int(0, 128).toString()),
]) {
  test(`Column.from([${input.join(', ')}]) parses ints and converts a col`, () => {
    const col = Column.from(input);
    expect(input).toHaveLength(col.length);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toEqual(parseInt(input[i]));
    }
  });
}

for (const input of [
  ['0.3'],
  ['0.9999', '99231.9'],
  Array(RAND.int(1, 100)).fill('').map(() => RAND.float(0, 128).toString()),
]) {
  test(`Column.from([${input.join(', ')}]) parses floats and converts a col`, () => {
    const col = Column.from(input);
    expect(input).toHaveLength(col.length);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    expect(col.dtype === 'f32' || col.dtype === 'f64').toBe(true);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(parseFloat(input[i]));
    }
  });
}

for (const input of [
  [0.3],
  [0.9999, 99911.9],
]) {
  test(`Column.of(${input.join(', ')}) parses floats and converts a col`, () => {
    const col = Column.from(input);
    expect(input).toHaveLength(col.length);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    expect(col.dtype === 'f32' || col.dtype === 'f64').toBe(true);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(input[i]);
    }
  });
}

for (const input of [
  ['0.03'],
  ['0.9999', '9231.0009'],
]) {
  test(`Column.of(${input.join(', ')}) parses floats and converts a col`, () => {
    const col = Column.of(...input);
    expect(input).toHaveLength(col.length);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(parseFloat(input[i]));
    }
  });
}

for (const input of [
  [3, 1, 3, 0],
  [-9990],
  Array(RAND.int(1, 100)).fill('').map(() => RAND.float(0, 128)),
  Array(RAND.int(1, 100)).fill('').map(() => RAND.int(0, 128)),
]) {
  test(`Column.of(${input.join(', ')}) parses ints and converts a col`, () => {
    const col = Column.of(...input);
    expect(input).toHaveLength(col.length);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(input[i]);
    }
  });
}

test(`Column.ones() creates a col full of ones`, () => {
  const n = RAND.int(1, 100);
  const col = Column.ones(n);
  expect(col).toHaveProperty('dtype', 'u8');
  expect(DTYPES).toContain(col.dtype);
  expect(col).toHaveLength(n);
  for (let i = 0; i < col.length; i++) {
    expect(col[i]).toEqual(1);
  }
});

test(`Column.zeros() creates a col full of zeros`, () => {
  const n = RAND.int(1, 100);
  const col = Column.zeros(n);
  expect(col).toHaveProperty('dtype', 'u8');
  expect(DTYPES).toContain(col.dtype);
  expect(col).toHaveLength(n);
  for (let i = 0; i < col.length; i++) {
    expect(col[i]).toEqual(0);
  }
});

test(`Column.empty() creates a col full of zeros`, () => {
  const n = RAND.int(1, 100);
  const col = Column.zeros(n);
  expect(col).toHaveProperty('dtype');
  expect(DTYPES).toContain(col.dtype);
  expect(col).toHaveLength(n);
});

for (const pair of [
  [RAND.int(), RAND.float()],
  [RAND.int(), RAND.int()],
  [RAND.int(), RAND.str()],
]) {
  const [n, v] = pair;
  test(`Column.repeat(${n}) creates a col full of ${n}`, () => {
    const col = Column.repeat(n, v);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    expect(col).toHaveLength(n);
    for (let i = 0; i < col.length; i++) {
      if (col.dtype === 's') {
        expect(col[i]).toEqual(v);
      } else {
        expect(col[i]).toBeCloseTo(v);
      }
    }
  });
}

for (const lBound of [0, 10, 100, -10, -1, -1000]) {
  const n = RAND.int(1, 100);
  const uBound = lBound + 5;
  test(`Column.rand(${n}, ${lBound}, ${uBound}) creates a col full of rand nums in range [${lBound}, ${uBound})`, () => {
    const col = Column.rand(n, lBound, uBound);
    expect(col).toHaveProperty('dtype');
    expect(DTYPES).toContain(col.dtype);
    expect(col).toHaveLength(n);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeGreaterThanOrEqual(lBound);
      expect(col[i]).toBeLessThan(uBound);
    }
  });
}

for (const pair of [
  [ 'u8',   'Uint8Array'],
  ['u16',  'Uint16Array'],
  ['u32',  'Uint32Array'],
  [ 'i8',    'Int8Array'],
  ['i16',   'Int16Array'],
  ['i32',   'Int32Array'],
  ['f32', 'Float32Array'],
  ['f64', 'Float64Array'],
]) {
  const [col, cons] = pair;
  test(`correct creates constructor ${cons.constructor.name} from string "${col}"`, () => {
    expect(Column.constFromDtype(col).name).toEqual(cons);
  });
}

// Tests for Methods

test('mean of Column [1, 2, 3] is 2', () => {
  expect(Column.of(1, 2, 3).mean()).toEqual(2);
});

for (const f of ['mad', 'stdev', 'var']) {
  const r = RAND.float();
  test(`${f} of Column [${r}, ${r}, ${r}] is 0 (${f} measure of spread should give 0 if there is no spread)`, () => {
    expect(Column.of(r, r, r)[f]()).toEqual(0);
  });
}

for (const pair of [
  [RAND.int(0, 10),     RAND.int(10, 100)],
  [RAND.float(0, 10),   RAND.float(10, 100)],
  [RAND.float(-10, 10), RAND.float(10, 100)],
]) {
  const [lBound, uBound] = pair;
  const col = Column.rand(100, lBound - 10, uBound + 10).clip(lBound, uBound);
  test(`after col.clip(${lBound}, ${uBound}) the col does not have any values smaller than (${lBound}) or greater than (${uBound})`, () => {
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeGreaterThanOrEqual(lBound - FLOAT_DELTA);
      expect(col[i]).toBeLessThanOrEqual(uBound + FLOAT_DELTA);
    }
  });
}

describe('arithmetic',  () => {
  for (const pair of [
    [RAND.int(),   RAND.int()],
    [RAND.int(),   RAND.float()],
    [RAND.float(), RAND.int()],
    [RAND.float(), RAND.float()],
  ]) {
    const [x, y] = pair;
    const col = Column.of(x, y);
    describe('operations on itself', () => {
      test(`${col.toString()}.add() should add all col items`, () => {
        expect(col.add()).toBeCloseTo(x + y);
      });
      test(`${col.toString()}.sub() should subtract all col items`, () => {
        expect(col.sub()).toBeCloseTo(x - y);
      });
      test(`${col.toString()}.mul() should multiply all col items`, () => {
        expect(col.mul()).toBeCloseTo(x * y);
      });
      test(`${col.toString()}.div() should divide all col items`, () => {
        expect(col.div()).toBeCloseTo(x / y);
      });
    });

    const singX = col.slice(0, 1);
    const singY = col.slice(1, 2);
    describe('operations on itself and other', () => {
      test(`${singX.toString()}.add(${singY.toString()}) should add items from other to itself`, () => {
        expect(singX.add(singY)[0]).toBeCloseTo(x + y);
      });
      test(`${singX.toString()}.sub(${singY.toString()}) should subtract items from other to itself`, () => {
        expect(singX.sub(singY)[0]).toBeCloseTo(x - y);
      });
      test(`${singX.toString()}.mul(${singY.toString()}) should multiply items from other to itself`, () => {
        expect(singX.mul(singY)[0]).toBeCloseTo(x * y);
      });
      test(`${singX.toString()}.div(${singY.toString()}) should divide items from other to itself`, () => {
        expect(singX.div(singY)[0]).toBeCloseTo(x / y);
      });
    });

    describe('operations on itself and a number', () => {
      test(`${singX.toString()}.add(${y}) should add y to every item`, () => {
        expect(singX.add(y)[0]).toBeCloseTo(x + y);
      });
      test(`${singX.toString()}.sub(${y}) should sub y from every item`, () => {
        expect(singX.sub(y)[0]).toBeCloseTo(x - y);
      });
      test(`${singX.toString()}.add(${y}) should mul every item by y`, () => {
        expect(singX.mul(y)[0]).toBeCloseTo(x * y);
      });
      test(`${singX.toString()}.add(${y}) should div every item by y`, () => {
        expect(singX.div(y)[0]).toBeCloseTo(x / y);
      });
    });
  }
});
