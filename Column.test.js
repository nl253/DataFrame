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
      test(`correct guesses dtype [${arr.join(', ')}] to be ${dtype2 === dtype ? dtype : `${dtype} OR ${dtype2}`}`, () => {
        const guess = Column.guessNumDtype(arr);
        expect(DTYPES).toContain(guess);
        if (dtype === dtype2) {
          expect(guess).toEqual(dtype);
        } else  {
          expect(guess === dtype || guess === dtype2).toEqual(true);
        }
      });
    }
  });

  describe('bag', () => {
    test('inserting 1, 2, 3, 1, 1 into a bag has 1x3, 2x1, 3x1', () => {
      const multiset = Column.bag([1, 2, 3, 1, 1]);
      expect(isMap(multiset)).toBe(true);
      expect(multiset.get(1)).toBe(3);
      expect(multiset.get(2)).toBe(1);
      expect(multiset.get(3)).toBe(1);
    });
  });
});

describe('generation', () => {

  for (const pair of [
    [RAND.int(0, INT_SMALL), RAND.int(INT_SMALL, INT_MEDIUM)],
    [RAND.float(0, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
    [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
  ]) {
    const [lBound, uBound] = pair;
    const col = Column.rand(INT_MEDIUM, lBound, uBound);
    for (let i = 0; i < col.length; i++) {
      test(`.rand(${col.length}, ${lBound}, ${uBound}) generated rand array with nums in range [${lBound}, ${uBound}) has ${i}th element (${col[i]}) in the range [${lBound}, ${uBound})`, () => {
        expect(col[i]).toBeLessThan(uBound);
        expect(col[i]).toBeGreaterThanOrEqual(lBound);
      });
    }
  }

  describe('.range(lBound, uBound, step)', () => {
    for (const pair of [
      [RAND.int(0, INT_SMALL), RAND.int(INT_SMALL, INT_MEDIUM), RAND.int(1, 3)],
      [RAND.float(0, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM), RAND.float(1, 3)],
      [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM), RAND.float(1, 3)],
    ]) {
      const [lBound, uBound, step] = pair;
      const arr = Column.range(lBound, uBound, step);
      for (let i = 0; i < arr.length; i++) {
        test(`range(${lBound}, ${uBound}, ${step}) has element ${i}th in range [${lBound}, ${uBound}) and is larger than previous element by ${step}`, () => {
          expect(arr[i]).toBeGreaterThanOrEqual(lBound - FLOAT_DELTA);
          expect(arr[i]).toBeLessThan(uBound + FLOAT_DELTA);
          if (i >= 1) {
            expect(arr[i]).toBeCloseTo(arr[i - 1] + step);
          }
        });
      }
    }
  });

  describe('.from(iterable)', () => {
    for (const input of [
      ['a', 'b'],
      ['a'],
      ['a123'],
      [],
    ]) {
      test(`.from([${input.join(', ')}]) gives a ColStr`, () => {
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
      Array(RAND.int(1, INT_MEDIUM)).fill('').map(() => RAND.int(0, 128).toString()),
    ]) {
      test(`.from([${input.join(', ')}]) parses ints and converts a col`, () => {
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
      Array(RAND.int(1, INT_MEDIUM)).fill('').map(() => RAND.float(0, 128).toString()),
    ]) {
      test(`.from([${input.join(', ')}]) parses floats and converts a col`, () => {
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
      test(`.from(${input.toString()}) parses floats and converts a col`, () => {
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
  });

  describe('.of(...items)', () => {
    for (const input of [
      [3, 1, 3, 0],
      [-9990],
      Array(RAND.int()).fill('').map(() => RAND.float(0, 128)),
      Array(RAND.int()).fill('').map(() => RAND.int(0, 128)),
    ]) {
      test(`.of(${input.join(', ')}) parses ints and converts a col`, () => {
        const col = Column.of(...input);
        expect(input).toHaveLength(col.length);
        expect(col).toHaveProperty('dtype');
        expect(DTYPES).toContain(col.dtype);
        for (let i = 0; i < col.length; i++) {
          expect(col[i]).toBeCloseTo(input[i]);
        }
      });
    }
  });

  test(`.ones(n) creates a col full of ones`, () => {
    const n = RAND.int();
    const col = Column.ones(n);
    expect(col).toHaveProperty('dtype', 'u8');
    expect(DTYPES).toContain(col.dtype);
    expect(col).toHaveLength(n);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toEqual(1);
    }
  });

  test(`.zeros(n) creates a col full of zeros`, () => {
    const n = RAND.int();
    const col = Column.zeros(n);
    expect(col).toHaveProperty('dtype', 'u8');
    expect(DTYPES).toContain(col.dtype);
    expect(col).toHaveLength(n);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toEqual(0);
    }
  });

  test(`.empty(n) creates a col full of zeros`, () => {
    const n = RAND.int();
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
    test(`.repeat(${n}) creates a col full of ${v} with length ${n}`, () => {
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

  for (const lBound of [0, INT_SMALL, INT_MEDIUM, -INT_SMALL, -1, -INT_LARGE]) {
    const n = RAND.int();
    const uBound = lBound + 5;
    test(`.rand(${n}, ${lBound}, ${uBound}) creates a col full of rand nums in range [${lBound}, ${uBound}) with length ${n}`, () => {
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
});

describe('methods', () => {

  describe('ColNum', () => {

    describe('statistical', () => {

      test('mean of Column [1, 2, 3] is 2', () => {
        expect(Column.of(1, 2, 3).mean()).toEqual(2);
      });

      describe('measures of spread', () => {
        for (const f of ['mad', 'stdev', 'var']) {
          for (const r of [RAND.int(), RAND.float()]) {
            test(`${f} of Column [${r}, ${r}, ${r}] is 0 (${f} measure of spread should give 0 if there is no spread)`, () => {
              expect(Column.of(r, r, r)[f]()).toEqual(0);
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
      for (const pair of [
        [RAND.int(0, INT_SMALL),     RAND.int(INT_SMALL, INT_MEDIUM)],
        [RAND.float(0, INT_SMALL),   RAND.float(INT_SMALL, INT_MEDIUM)],
        [RAND.float(-INT_SMALL, INT_SMALL), RAND.float(INT_SMALL, INT_MEDIUM)],
      ]) {
        const [lBound, uBound] = pair;
        const col = Column.rand(INT_MEDIUM, lBound - INT_SMALL, uBound + INT_SMALL).clip(lBound, uBound);
        test(`after col.clip(${lBound}, ${uBound}) the col does not have any values smaller than (${lBound}) or greater than (${uBound})`, () => {
          for (let i = 0; i < col.length; i++) {
            expect(col[i]).toBeGreaterThanOrEqual(lBound - FLOAT_DELTA);
            expect(col[i]).toBeLessThanOrEqual(uBound + FLOAT_DELTA);
          }
        });
      }
    });

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
      test(`col.replace(${v}) removes all such items from the col`, () => expect([...c.replace(v, 0)]).not.toContain(v));
      test(`col.removeAll(${v}) removes all such items from the col`, () => expect([...c.removeAll(v)]).not.toContain(v));
      describe(`${c}.concat(${c}) joins 2 cols`, () => {
        const c2 = c.clone();
        const c3 = c.concat(c2);
        const newColLen = c.length + c2.length;
        test('new col has correct length', () => expect(c3).toHaveLength(newColLen));
        for (let i = 0; i < c.length; i++) {
          test(`new col at idx #${i} should have ${c[i]}`, () => {
            if (c.dtype === 's') {
              expect(c3[i]).toEqual(c[i]);
            } else {
              expect(c3[i]).toBeCloseTo(c[i]);
            }
          });
        }
        for (let i = c.length; i < newColLen; i++) {
          test(`new col at idx #${i} should have ${c2[i]}`, () => {
            if (c.dtype === 's') {
              expect(c3[i]).toEqual(c2[i - c.length]);
            } else {
              expect(c3[i]).toBeCloseTo(c2[i - c.length]);
            }
          });
        }
      });
      describe(`${c}.unique() removes duplicate items`, () => {
        const c2 = c.unique();
        const c2Arr = [...c2];
        for (let i = 0; i < c2.length; i++) {
          const val = c2[i];
          test(`${c2} should not contain ${val}`, () => {
            expect(c2Arr.slice(i + 1)).not.toContain(val);
            expect(c2Arr.slice(0, i)).not.toContain(val);
          });
        }
      });
    }
  });
});
