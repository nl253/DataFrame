/* eslint-disable no-magic-numbers,array-element-newline,no-multi-spaces,array-bracket-spacing,max-lines,array-bracket-newline,max-nested-callbacks,complexity */
const Column = require('./Column');
const { isMap } = require('./utils');

const FLOAT_DELTA = 0.001;

const LOW_BOUND_INT = 0;
const HIGH_BOUND_INT = 100;

const LOW_BOUND_FLOAT = -100;
const HIGH_BOUND_FLOAT = 100;

const STR_MAX_LEN = 20;

const INT_LARGE = 1000;
const INT_MEDIUM = 100;
const INT_SMALL = 10;

const DTYPES = ['s', 'u8', 'u16', 'u32', 'i8', 'i16', 'i32', 'f32', 'f64'];

const ARRAY_PROTO_METHODS = [
  'concat',
  'constructor',
  'copyWithin',
  'entries',
  'every',
  'fill',
  'filter',
  'find',
  'findIndex',
  'flat',
  'flatMap',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'map',
  'pop',
  'push',
  'reduce',
  'reduceRight',
  'reverse',
  'shift',
  'slice',
  'some',
  'sort',
  'splice',
  'toLocaleString',
  'toString',
  'unshift',
  'values',
];
const TYPED_ARRAY_PROTO_METHODS = [
  'findIndex',
  'forEach',
  'includes',
  'indexOf',
  'join',
  'keys',
  'lastIndexOf',
  'length',
  'map',
  'reduce',
  'reduceRight',
  'reverse',
  'set',
  'slice',
  'some',
  'sort',
  'subarray',
  'toLocaleString',
  'toString',
  'values',
];

expect.extend({
  toBeInRange(received, floor, ceiling) {
    return {
      message: () => `expected ${received} not to be within range [${floor}, ${ceiling})`,
      pass: received >= floor && received < ceiling,
    };
  },
  toBeValidCol(col, ...dtypes) {
    return {
      message: dtypes.length === 0 ? () => `expected ${col} to be valid col` : () => `expected ${col} to be valid col with dtype being one of [${dtypes.join(', ')}]`,
      pass: col !== null
        && col !== undefined
        && DTYPES.some((x) => x === col.dtype)
        && Number.isInteger(col.length)
        && (dtypes.length === 0 || dtypes.some((t) => t === col.dtype)),
    };
  }
});

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
  },
  colNum() {
    return Math.random() < 0.33 ? this.colInt() : this.colFloat();
  },
  colInt() {
    return Column.rand(this.int(), this.int(0, INT_SMALL), this.int(INT_SMALL, INT_LARGE));
  },
  colFloat() {
    return Column.rand(this.int(), this.float(-INT_SMALL, INT_SMALL), this.float(INT_SMALL, INT_LARGE));
  },
  colStr() {
    return Column.rand(this.int(), this.int(0, INT_SMALL), this.int(INT_SMALL, INT_SMALL * 2), 's');
  },
  el(c) {
    return c[this.int(0, c.length)];
  }
};

// Tests for Functions

describe('utils', () => {
  describe('dtype inference',  () => {
    test.each([
      [[1, 2], 'u8', 'u8'],
      [[-1, 2], 'i8', 'i8'],
      [[-0.99, 2], 'f64', 'f32'],
      [[2 ** 8, 0], 'u16', 'u16'],
      [[2 ** 16, 0], 'u32', 'u32'],
      [[-(2 ** 8), 0], 'i16', 'i16'],
      [[0.8], 'f64', 'f32'],
    ])('guesses dtype of %p to be %s OR %s', (arr, dtype, dtype2) => {
      const guess = Column.guessNumDtype(arr);
      expect(DTYPES).toContain(guess);
      if (dtype === dtype2) {
        expect(guess).toStrictEqual(dtype);
      } else {
        expect(guess === dtype || guess === dtype2).toStrictEqual(true);
      }
    });
  });
});

describe('generation', () => {

  describe(`.rand(${INT_MEDIUM}, lBound, uBound)`, () => test.each([
    [RAND.int(0, INT_SMALL), RAND.int(INT_SMALL, INT_MEDIUM)],
    [RAND.float(0, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
    [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
  ])(`with lBound = %d, uBound = %d generates rand array with nums in range [lBound, uBound)`, (lBound, uBound) => {
    const col = Column.rand(INT_MEDIUM, lBound, uBound);
    expect(col).toBeValidCol();
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeLessThan(uBound);
      expect(col[i]).toBeGreaterThanOrEqual(lBound);
    }
  }));

  describe('.range(lBound uBound, step)', () => test.each([
    [
      RAND.int(0, INT_SMALL),
      RAND.int(INT_SMALL, INT_MEDIUM),
      RAND.int(1, 3),
    ],
    [
      RAND.float(0, INT_SMALL),
      RAND.float(INT_SMALL, INT_MEDIUM),
      RAND.float(1, 3)],
    [
      RAND.float(-INT_SMALL, INT_SMALL),
      RAND.float(INT_SMALL, INT_MEDIUM),
      RAND.float(1, 3)],
  ])(
    `with lBound = %d, uBound = %d, step = %d has each element in range [lBound, uBound) and is larger than previous element by step`,
    (lBound, uBound, step) => {
      const arr = Column.range(lBound, uBound, step);
      for (let i = 0; i < arr.length; i++) {
        expect(arr[i]).toBeInRange(lBound - FLOAT_DELTA, uBound + FLOAT_DELTA);
        if (i >= 1) {
          expect(arr[i]).toBeCloseTo(arr[i - 1] + step);
        }
      }
    }
  ));

  describe('.from(iterable)', () => {
    test.each([
      ['a', 'b'],
      ['a'],
      ['a123'],
      [],
    ])('converts %p to ColStr because not parsable ', (...input) => {
      const col = Column.from(input);
      expect(col).toBeValidCol('s');
      expect(input).toHaveLength(col.length);
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toStrictEqual(input[i]);
      }
    });

    test.each([
      ['0'],
      ['0', '1'],
      Array(RAND.int(1, INT_MEDIUM)).fill('').map(() => RAND.int(0, 128).toString()),
    ])(`parses ints %p and converts to col`, (...input) => {
      const col = Column.from(input);
      expect(col).toBeValidCol('u8', 'f32', 'f64');
      expect(input).toHaveLength(col.length);
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toStrictEqual(parseInt(input[i]));
      }
    });

    test.each([
      ['0.3'],
      ['0.9999', '99231.9'],
      Array(RAND.int(1, INT_MEDIUM)).fill('').map(() => RAND.float(0, 128).toString()),
    ])(`parses floats %p and converts a col`, (...input) => {
      const col = Column.from(input);
      expect(input).toHaveLength(col.length);
      expect(col).toBeValidCol('f32', 'f64');
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toBeCloseTo(parseFloat(input[i]));
      }
    });

    test.each([
      [0.3],
      [0.9999, 99911.9],
    ])(`floats %p and converts a col`, (...input) => {
      const col = Column.from(input);
      expect(col).toBeValidCol('f32', 'f64');
      expect(input).toHaveLength(col.length);
      for (let i = 0; i < col.length; i++) {
        expect(col[i]).toBeCloseTo(input[i]);
      }
    });
  });

  describe('.of(...item)', () => test.each([
    [3, 1, 3, 0],
    [-9990],
    Array(RAND.int()).fill('').map(() => RAND.float(0, 128)),
    Array(RAND.int()).fill('').map(() => RAND.int(0, 128)),
  ])(`parses ints %p and converts a col`, (...input) => {
    const col = Column.of(...input);
    expect(col).toBeValidCol();
    expect(input).toHaveLength(col.length);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(input[i]);
    }
  }));

  test(`.ones(n) creates a col full of ones`, () => {
    const n = RAND.int();
    const col = Column.ones(n);
    expect(col).toBeValidCol('u8');
    expect(col).toHaveLength(n);
    for (const v of col) {
      expect(v).toStrictEqual(1);
    }
  });

  test(`.zeros(n) creates a col full of zeros`, () => {
    const n = RAND.int();
    const col = Column.zeros(n);
    expect(col).toBeValidCol('u8');
    expect(col).toHaveLength(n);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toStrictEqual(0);
    }
  });

  test(`.empty(n) creates a col full of zeros`, () => {
    const n = RAND.int();
    const col = Column.zeros(n);
    expect(col).toBeValidCol('u8');
    expect(col).toHaveLength(n);
  });

  describe('.repeat(n, v)', () => test.each([
    [RAND.int(), RAND.float(), 'f32', 'f64'],
    [RAND.int(), RAND.int(), 'u8', 'u16', 'u32', 'i8', 'i16', 'i32'],
    [RAND.int(), RAND.str(), 's'],
  ])(`with n = %i and v = %p creates a col full of v with length n`, (n, v, ...dtypes) => {
    const col = Column.repeat(n, v);
    expect(col).toBeValidCol(...dtypes);
    expect(col).toHaveLength(n);
    for (const x of col) {
      if (col.dtype === 's') {
        expect(x).toStrictEqual(v);
      } else {
        expect(x).toBeCloseTo(v);
      }
    }
  }));

  describe('Column.constFromDtype', () => test.each([
    ['u8', 'Uint8Array'],
    ['u16', 'Uint16Array'],
    ['u32', 'Uint32Array'],
    ['i8', 'Int8Array'],
    ['i16', 'Int16Array'],
    ['i32', 'Int32Array'],
    ['f32', 'Float32Array'],
    ['f64', 'Float64Array'],
  ])('given %s creates %s constructor', (col, cons) => expect(Column.constFromDtype(col).name).toEqual(cons)));
});

describe('ColNum', () => {

  describe('statistical', () => {

    test('[1, 2, 3].mean() === 2', () => expect(Column.of(1, 2, 3).mean()).toStrictEqual(2));

    describe('measure of spread should give 0 if there is no spread', () => {
      const n = RAND.int();
      for (const f of ['mad', 'stdev', 'var']) {
        for (const v of [RAND.int(), RAND.float()]) {
          test(`Column.repeat(${n}, ${v}).${f}() ===  0`, () => {
            expect(Column.repeat(n, v)[f]()).toStrictEqual(0);
          });
        }
      }
    });
  });

  describe('Math object operations', () => {
    const mathObjectOps = ['round', 'trunc', 'floor', 'ceil', 'abs'];
    const c = RAND.colNum();
    for (const f of mathObjectOps) {
      const col = c[f]();
      test(`col.${f}() applies Math.${f} to each item`, () => {
        for (let i = 0; i < col.length; i++) {
          expect(col[i]).toBeCloseTo(Math[f](c[i]));
        }
      });
    }
  });

  describe('.clip(lBound, uBound)', () => {
    test.each([
      [RAND.int(0, INT_SMALL),         RAND.int(INT_SMALL, INT_MEDIUM)],
      [RAND.float(0, INT_SMALL),       RAND.float(INT_SMALL, INT_MEDIUM)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
    ])('with lBound = %d, uBound = %d have values between the range', (lBound, uBound) => {
      const col = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL)
                        .clip(lBound, uBound);
      for (const v of col) {
        expect(v).toBeGreaterThanOrEqual(lBound - FLOAT_DELTA);
        expect(v).toBeLessThanOrEqual(uBound + FLOAT_DELTA);
      }
    });
  });

  describe('.smooth(n)', () => {
    test.each([
      [RAND.int(0, INT_SMALL),         RAND.int(INT_SMALL, INT_MEDIUM),   RAND.int(2, 5)],
      [RAND.float(0, INT_SMALL),       RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
    ])('with lBound = %d, uBound = %d and n = %d have only floats all smaller than max value and larger than min value', (lBound, uBound, n) => {
      const col = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL)
                        .smooth(n);
      expect(col).toBeValidCol('f32', 'f64');
      const max = col.max();
      const min = col.min();
      for (const v of col) {
        expect(v).toBeGreaterThanOrEqual(min);
        expect(v).toBeLessThanOrEqual(max);
      }
    });
  });

  describe('.kBins(k)', () => {
    test.each([
      [RAND.int(0, INT_SMALL),         RAND.int(INT_SMALL, INT_MEDIUM),   RAND.int(2, 5)],
      [RAND.float(0, INT_SMALL),       RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
    ])('with lBound = %d, uBound = %d and n = %d have only natural numbers all in range [0, %d]', (lBound, uBound, k) => {
      const col = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL)
                        .kBins(k);
      expect(col).toBeValidCol('u8');
      for (const v of col) {
        expect(v).toBeInRange(0, k);
      }
    });
  });

  describe('.disDiff(n)', () => {
    test.each([
      [RAND.int(0, INT_SMALL),         RAND.int(INT_SMALL, INT_MEDIUM),   RAND.int(2, 5)],
      [RAND.float(0, INT_SMALL),       RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM), RAND.int(2, 5)],
    ])('with lBound = %d, uBound = %d and n = %d have only floats with length smaller by %d than original array', (lBound, uBound, n) => {
      const xs = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL);
      const col = xs.disDiff(n);
      expect(col).toBeValidCol('f32', 'f64');
      expect(col).toHaveLength(xs.length - n);
    });
  });

  describe('.normalize(n)', () => {
    test.each([
      [RAND.int(0, INT_SMALL),         RAND.int(INT_SMALL, INT_MEDIUM), ],
      [RAND.float(0, INT_SMALL),       RAND.float(INT_SMALL, INT_MEDIUM)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
    ])('with lBound = %d, uBound = %d and n = %d have only floats all in [0, 1]', (lBound, uBound) => {
      const col = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL)
                        .normalize();
      expect(col).toBeValidCol('f32', 'f64');
      for (const v of col) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(1);
      }
    });
  });

  describe('arithmetic', () => describe.each([
    [RAND.int(), RAND.int()],
    [RAND.int(), RAND.float()],
    [RAND.float(), RAND.int()],
    [RAND.float(), RAND.float()],
  ])('col [%d, %d]', (x, y) => {

    const col = Column.of(x, y);
    test.each([
      ['add', x + y],
      ['sub', x - y],
      ['mul', x * y],
      ['div', x / y],
    ])(`${col.toString()}.%s() === %d`, (f, v) => expect(col[f]()).toBeCloseTo(v));

    const singX = col.slice(0, 1);
    const singY = col.slice(1, 2);
    test.each([
      ['add', x + y],
      ['sub', x - y],
      ['mul', x * y],
      ['div', x / y],
    ])(`${singX.toString()}.%s(${singY.toString()})`, (f, expected) => expect(singX[f](singY)[0]).toBeCloseTo(expected));

    test.each([
      ['add', x + y],
      ['sub', x - y],
      ['mul', x * y],
      ['div', x / y],
    ])(`${singX}.%s(${y})`, (f, v) => expect(singX[f](y)[0]).toBeCloseTo(v));
  }));
});

describe('ColStr and ColNum (shared)', () => {
  for (const c of [RAND.colStr(), RAND.colInt(), RAND.colFloat()]) {
    const v = RAND.el(c);
    describe(`col implements all methods from Array`, () => {
      for (const method of ARRAY_PROTO_METHODS) {
        test(`col.${method} is implemented`, () => expect(c[method]).toBeDefined());
      }
    });
    describe(`col implements all methods from TypedArray`, () => {
      for (const method of TYPED_ARRAY_PROTO_METHODS) {
        test(`col.${method} is implemented`, () => expect(c[method]).toBeDefined());
      }
    });
    describe(`col.ps() creates a map of probabilities`, () => {
      const ps = c.ps();
      test(`${ps} is a Map`, () => expect(isMap(ps)).toBe(true));
      for (const k of ps.keys()) {
        const val = ps.get(k);
        test(`${val} is a probability`, () => {
          expect(val).toBeLessThanOrEqual(1);
          expect(val).toBeGreaterThanOrEqual(0);
        });
      }
      test('probabilities add up to 1', () => expect([...ps.keys()].map((k) => ps.get(k)).reduce((x, y) => x + y, 0)).toBeCloseTo(1));
    });
    test('col.shuffle() reorders elements so that at least 25% of elements changed place', () => {
      const col = c.shuffle();
      expect(col).toBeValidCol(c.dtype);
      expect(col).toHaveLength(c.length);
      const reordered = col.filter((x, idx) => c[idx] !== x).reduce((acc, _) => acc + 1, 0);
      const reorderedRatio = reordered / col.length;
      expect(reorderedRatio).toBeGreaterThanOrEqual(0.25);
    });
    if (c.dtype !== 's') {
      describe('col.sort()', () => {
        for (const arg of [undefined, 'asc', ((a, b) => a > b ? 1 : a < b ? -1 : 0)]) {
          test(`col.sort(${arg}) sorts column ascending`, () => {
            const col = c.sort(arg);
            expect(col).toBeValidCol(c.dtype);
            expect(col).toHaveLength(c.length);
            for (let i = 1; i < col.length; i++) {
              expect(col[i]).toBeGreaterThanOrEqual(col[i - 1]);
            }
          });
        }
        for (const arg of ['des', ((a, b) => a > b ? -1 : a < b ? 1 : 0)]) {
          test(`col.sort(${arg}) sorts column descending`, () => {
            const col = c.sort(arg);
            expect(col).toBeValidCol(c.dtype);
            expect(col).toHaveLength(c.length);
            for (let i = 1; i < col.length; i++) {
              expect(col[i]).toBeLessThanOrEqual(col[i - 1]);
            }
          });
        }
      });
    }
    test('col.reverse() reverses column', () => {
      const col = c.reverse();
      expect(col).toBeValidCol(c.dtype);
      expect(col).toHaveLength(c.length);
      if (col.dtype === 's') {
        for (let i = 0; i < c.length; i++) {
          expect(col[i]).toStrictEqual(c[c.length - 1 - i]);
        }
      } else {
        for (let i = 0; i < c.length; i++) {
          expect(col[i]).toBeCloseTo(c[c.length - 1 - i]);
        }
      }
    });
    test(`col.replace(${v}) removes all such items from the col`, () => {
      expect([...c.replace(v, 0)]).not.toContain(v);
    });
    test(`col.removeAll(${v}) removes all such items from the col`, () => {
      expect([...c.removeAll(v)]).not.toContain(v);
    });
    test(`${c}.concat(${c}) joins 2 cols`, () => {
      const c2 = c.clone();
      const c3 = c.concat(c2);
      const newColLen = c.length + c2.length;
      expect(c3).toHaveLength(newColLen);
      for (let i = 0; i < c.length; i++) {
        if (c.dtype === 's') {
          expect(c3[i]).toStrictEqual(c[i]);
        } else {
          expect(c3[i]).toBeCloseTo(c[i]);
        }
      }
      for (let i = c.length; i < newColLen; i++) {
        if (c.dtype === 's') {
          expect(c3[i]).toStrictEqual(c2[i - c.length]);
        } else {
          expect(c3[i]).toBeCloseTo(c2[i - c.length]);
        }
      }
    });
    test(`${c}.unique() removes duplicate items`, () => {
      const c2 = c.unique();
      const c2Arr = [...c2];
      for (let i = 0; i < c2.length; i++) {
        const val = c2[i];
        expect(c2Arr.slice(i + 1)).not.toContain(val);
        expect(c2Arr.slice(0, i)).not.toContain(val);
      }
    });
  }
});
