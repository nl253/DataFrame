const Column = require('./Column');

// TODO unit test for `Column.IQR`
// TODO unit test for `Column.Q1`
// TODO unit test for `Column.Q3`
// TODO unit test for `Column.abs`
// TODO unit test for `Column.add`
// TODO unit test for `Column.all`
// TODO unit test for `Column.argMax`
// TODO unit test for `Column.argMin`
// TODO unit test for `Column.cast`
// TODO unit test for `Column.ceil`
// [X]  unit test for `Column.clip`
// TODO unit test for `Column.clone`
// TODO unit test for `Column.concat`
// TODO unit test for `Column.contains`
// TODO unit test for `Column.counts`
// TODO unit test for `Column.cube`
// TODO unit test for `Column.div`
// TODO unit test for `Column.dot`
// TODO unit test for `Column.downcast`
// TODO unit test for `Column.drop`
// TODO unit test for `Column.filter`
// TODO unit test for `Column.floor`
// TODO unit test for `Column.head`
// TODO unit test for `Column.mad`
// TODO unit test for `Column.magnitude`
// TODO unit test for `Column.map`
// TODO unit test for `Column.max`
// [X]  unit test for `Column.mean`
// TODO unit test for `Column.median`
// TODO unit test for `Column.min`
// TODO unit test for `Column.mode`
// TODO unit test for `Column.mul`
// TODO unit test for `Column.nLargest`
// TODO unit test for `Column.nQuart`
// TODO unit test for `Column.nSmallest`
// TODO unit test for `Column.none`
// TODO unit test for `Column.normalize`
// TODO unit test for `Column.pop`
// TODO unit test for `Column.pow`
// TODO unit test for `Column.print`
// TODO unit test for `Column.range`
// TODO unit test for `Column.replace`
// TODO unit test for `Column.reverse`
// TODO unit test for `Column.round`
// TODO unit test for `Column.sample`
// TODO unit test for `Column.shuffle`
// TODO unit test for `Column.skewness`
// TODO unit test for `Column.slice`
// TODO unit test for `Column.sort`
// TODO unit test for `Column.square`
// TODO unit test for `Column.std`
// TODO unit test for `Column.sub`
// TODO unit test for `Column.subarray`
// TODO unit test for `Column.swap`
// TODO unit test for `Column.tail`
// TODO unit test for `Column.takeWhile`
// TODO unit test for `Column.trimOutliers`
// TODO unit test for `Column.trunc`
// TODO unit test for `Column.unique`
// TODO unit test for `Column.var`
// TODO unit test for `Column.zipWith`
// TODO unit test for `Column.zipWith3`

// Tests for Functions

for (const triplet of [
    [[        1,   2],  'u8',  'u8'],
    [[       -1,   2],  'i8',  'i8'],
    [[    -0.99,   2], 'f64', 'f32'],
    [[   2 ** 8,   0], 'u16', 'u16'],
    [[  2 ** 16,   0], 'u32', 'u32'],
    [[-(2 ** 8),   0], 'i16', 'i16'],
    [[.8],             'f64', 'f32'],
  ]) {
  const [arr, dtype, dtype2] = triplet;
  test('correct guesses dtype [-1,2] to be i8 ', () => {
    const guess = Column.guessNumDtype(arr);
    if (dtype === dtype2) {
      expect(guess).toEqual(dtype);
    } else  {
      expect(guess === dtype || guess === dtype2).toEqual(true);
    }
  });
}

for (const pair of [
    [0, 1],
    [-10, 10],
  ]) {
  const [lBound, uBound] = pair;
  const arr = Column.rand(100);
  for (let i = 0; i < arr.length; i++) {
    test(
      `rand generated rand array with nums in range [${lBound}, ${uBound}) has element ${i} (${arr[i]}) in the range`,
      () => {
        expect(arr[i]).toBeLessThan(uBound);
        expect(arr[i]).toBeGreaterThanOrEqual(lBound);
      });
  }
}

test('inserting 1, 2, 3, 1, 1 into a bag has 1x3, 2x1, 3x1', () => {
  const multiset = Column.bag([1, 2, 3, 1, 1]);
  expect(multiset.get(1)).toBe(3);
  expect(multiset.get(2)).toBe(1);
  expect(multiset.get(3)).toBe(1);
});

for (const pair of [
    [  0, 10],
    [  0, 30],
    [-10, 99]
  ]) {
  const [lBound, uBound] = pair;
  const arr = Column.range(lBound, uBound);
  for (let i = 0; i < arr.length; i++) {
    test(
      `range(${lBound}, ${uBound}) has all element ${lBound} <= ${i}th element (${arr[i]}) < ${uBound}`,
      () => {
        expect(arr[i]).toBeGreaterThanOrEqual(lBound);
        expect(arr[i]).toBeLessThan(uBound);
      });
  }
}

for (const input of [
    ["a", "b"],
    ["a"],
    ["a123"],
    [],
  ]) {
  test(`Column.from([${input.join(', ')}]) gives a normal array`, () => {
    const s = Column.from(input);
    expect(input).toHaveLength(s.length);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(input[i]);
    }
  });
}

for (const input of [
    ['0'],
    ['0', '1'],
  ]) {
  test(`Column.from([${input.join(', ')}]) parses ints and converts a col`, () => {
    const s = Column.from(input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseInt(input[i]));
    }
  });
}

for (const input of [
    ['0.3'],
    ['0.9999', '99231.9'],
  ]) {
  test(`Column.from([${input.join(', ')}]) parses floats and converts a col`, () => {
    const col = Column.from(input);
    expect(input).toHaveLength(col.length);
    expect(col).toHaveProperty('dtype');
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
    expect(col.dtype === 'f32' || col.dtype === 'f64').toBe(true);
    for (let i = 0; i < col.length; i++) {
      expect(col[i]).toBeCloseTo(input[i]);
    }
  });
}

for (const input of [
    ["0.03"],
    ["0.9999", "9231.0009"],
  ]) {
  test(`Column.of(${input.join(', ')}) parses floats and converts a col`, () => {
    const s = Column.of(...input);
    expect(input).toHaveLength(s.length);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeCloseTo(parseFloat(input[i]));
    }
  });
}

for (const input of [
    [3, 1, 3, 0],
    [-9990],
  ]) {
  test(`Column.of(${input.join(', ')}) parses ints and converts a col`, () => {
    const s = Column.of(...input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseInt(input[i]));
    }
  });
}

for (const n of [0, 10, 99]) {
  test(`Column.ones(${n}) creates a col full of ones`, () => {
    const s = Column.ones(n);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(1);
    }
  });
}

for (const n of [0, 10, 99]) {
  test(`Column.zeros(${n}) creates a col full of zeros`, () => {
    const s = Column.zeros(n);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(0);
    }
  });
  test(`Column.empty(${n}) creates a col full of zeros`, () => {
    const s = Column.zeros(n);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(0);
    }
  });
}

for (const pair of [
    [0, 0.1],
    [10, 99],
    [99, -231]
  ]) {
  const [n, v] = pair;
  test(`Column.repeat(${n}) creates a col full of ${n}`, () => {
    const s = Column.repeat(n, v);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(v);
    }
  });
}

for (const n of [0, 1, 9, 222]) {
  for (const lBound of [0, 10, 100, -10, -1, -1000]) {
    const uBound = lBound + 5
    test(
      `Column.rand(${n}, ${lBound}, ${uBound}) creates a col full of rand nums in range [${lBound}, ${uBound})`,
      () => {
        const s = Column.rand(n, lBound, uBound);
        expect(s).toHaveProperty('dtype');
        expect(s).toHaveLength(n);
        for (let i = 0; i < s.length; i++) {
          expect(s[i]).toBeGreaterThanOrEqual(lBound);
          expect(s[i]).toBeLessThan(uBound);
        }
      });
  }
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
  const [s, cons] = pair;
  test(`correct creates constructor ${cons.constructor.name} from string "${s}"`, () => {
    expect(Column.constFromDtype(s).name).toEqual(cons);
  });
}


// Tests for Methods

test('mean of Column [1, 2, 3] is 2', () => {
  expect(Column.of(1, 2, 3).mean()).toEqual(2);
});

for (const f of ['mad', 'stdev', 'var']) {
  test(
    `${f} of Column [1, 1, 1] is 0 (${f} measure of spread should give 0 if there is no spread)`,
    () => {
      expect(Column.of(1, 1, 1)[f]()).toEqual(0);
    });
}


for (const pair of [
    [    0,   1],
    [   -5,   5],
    [-0.99, 1.1],
  ]) {
  const [lBound, uBound] = pair;
  const s = Column.rand(100, lBound - 10, uBound + 10).clip(lBound, uBound);
  test(`after col.clip(${lBound}, ${uBound}) the col does not have any values smaller than (${lBound}) or greater than (${uBound})`, () => {
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(lBound - 0.001);
      expect(s[i]).toBeLessThanOrEqual(uBound + 0.001);
    }
  });
}
