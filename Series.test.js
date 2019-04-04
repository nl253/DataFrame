const Series = require('./Series');

// TODO unit test for `Series.IQR`
// TODO unit test for `Series.Q1`
// TODO unit test for `Series.Q3`
// TODO unit test for `Series.abs`
// TODO unit test for `Series.add`
// TODO unit test for `Series.all`
// TODO unit test for `Series.argMax`
// TODO unit test for `Series.argMin`
// TODO unit test for `Series.cast`
// TODO unit test for `Series.ceil`
// [X]  unit test for `Series.clip`
// TODO unit test for `Series.clone`
// TODO unit test for `Series.concat`
// TODO unit test for `Series.contains`
// TODO unit test for `Series.counts`
// TODO unit test for `Series.cube`
// TODO unit test for `Series.div`
// TODO unit test for `Series.dot`
// TODO unit test for `Series.downcast`
// TODO unit test for `Series.drop`
// TODO unit test for `Series.dropInfinity`
// TODO unit test for `Series.dropNaN`
// TODO unit test for `Series.filter`
// TODO unit test for `Series.floor`
// TODO unit test for `Series.head`
// TODO unit test for `Series.mad`
// TODO unit test for `Series.magnitude`
// TODO unit test for `Series.map`
// TODO unit test for `Series.max`
// [X]  unit test for `Series.mean`
// TODO unit test for `Series.median`
// TODO unit test for `Series.min`
// TODO unit test for `Series.mode`
// TODO unit test for `Series.mul`
// TODO unit test for `Series.nLargest`
// TODO unit test for `Series.nQuart`
// TODO unit test for `Series.nSmallest`
// TODO unit test for `Series.none`
// TODO unit test for `Series.normalize`
// TODO unit test for `Series.pop`
// TODO unit test for `Series.pow`
// TODO unit test for `Series.print`
// TODO unit test for `Series.range`
// TODO unit test for `Series.replace`
// TODO unit test for `Series.reverse`
// TODO unit test for `Series.round`
// TODO unit test for `Series.sample`
// TODO unit test for `Series.shuffle`
// TODO unit test for `Series.skewness`
// TODO unit test for `Series.slice`
// TODO unit test for `Series.sort`
// TODO unit test for `Series.square`
// TODO unit test for `Series.std`
// TODO unit test for `Series.sub`
// TODO unit test for `Series.subarray`
// TODO unit test for `Series.swap`
// TODO unit test for `Series.tail`
// TODO unit test for `Series.takeWhile`
// TODO unit test for `Series.trimOutliers`
// TODO unit test for `Series.trunc`
// TODO unit test for `Series.unique`
// TODO unit test for `Series.var`
// TODO unit test for `Series.zipWith`
// TODO unit test for `Series.zipWith3`

// Tests for Functions

for (const pair of [
    [[        1,   2],  'u8'],
    [[       -1,   2],  'i8'],
    [[    -0.99,   2], 'f64'],
    [[   2 ** 8,   0], 'u16'],
    [[  2 ** 16,   0], 'u32'],
    [[-(2 ** 8),   0], 'i32'],
    [[.8],             'f64'],
  ]) {
  const [arr, dtype] = pair;
  test('correct guesses dtype [-1,2] to be i8 ', () => {
    expect(Series.guessNumDtype(arr)).toEqual(dtype);
  });
}

for (const pair of [
    [0, 1],
    [-10, 10],
  ]) {
  const [lBound, uBound] = pair;
  const arr = Series.rand(100);
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
  const multiset = Series.bag([1, 2, 3, 1, 1]);
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
  const arr = Series.range(lBound, uBound);
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
  test(`Series.from([${input.join(', ')}]) gives a normal array`, () => {
    const s = Series.from(input);
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
  test(`Series.from([${input.join(', ')}]) parses ints and converts a series`, () => {
    const s = Series.from(input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseInt(input[i]));
    }
  });
}

for (const input of [
    ['0.3'],
    ['0.9999', '99919231.9'],
  ]) {
  test(`Series.from([${input.join(', ')}]) parses floats and converts a series`, () => {
    const s = Series.from(input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseFloat(input[i]));
    }
  });
}

for (const input of [
    [0.3],
    [0.9999, 99919231.9],
  ]) {
  test(`Series.of(${input.join(', ')}) parses floats and converts a series`, () => {
    const s = Series.of(...input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(input[i]);
    }
  });
}

for (const input of [
    ["0.03"],
    ["0.9999", "9231.0009"],
  ]) {
  test(`Series.of(${input.join(', ')}) parses floats and converts a series`, () => {
    const s = Series.of(...input);
    expect(input).toHaveLength(s.length);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseFloat(input[i]));
    }
  });
}

for (const input of [
    [3, 1, 3, 0],
    [-9990],
  ]) {
  test(`Series.of(${input.join(', ')}) parses ints and converts a series`, () => {
    const s = Series.of(...input);
    expect(input).toHaveLength(s.length);
    expect(s).toHaveProperty('dtype');
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(parseInt(input[i]));
    }
  });
}

for (const n of [0, 10, 99]) {
  test(`Series.ones(${n}) creates a series full of ones`, () => {
    const s = Series.ones(n);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(1);
    }
  });
}

for (const n of [0, 10, 99]) {
  test(`Series.zeros(${n}) creates a series full of zeros`, () => {
    const s = Series.zeros(n);
    expect(s).toHaveProperty('dtype');
    expect(s).toHaveLength(n);
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toEqual(0);
    }
  });
  test(`Series.empty(${n}) creates a series full of zeros`, () => {
    const s = Series.zeros(n);
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
  test(`Series.fill(${n}) creates a series full of ${n}`, () => {
    const s = Series.fill(n, v);
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
      `Series.rand(${n}, ${lBound}, ${uBound}) creates a series full of rand nums in range [${lBound}, ${uBound})`,
      () => {
        const s = Series.rand(n, lBound, uBound);
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
    expect(Series.constFromDtype(s).name).toEqual(cons);
  });
}


// Tests for Methods

test('mean of Series [1, 2, 3] is 2', () => {
  expect(Series.of(1, 2, 3).mean()).toEqual(2);
})

for (const f of ['mad', 'stdev', 'var']) {
  test(
    `${f} of Series [1, 1, 1] is 0 (${f} measure of spread should give 0 if there is no spread)`,
    () => {
      expect(Series.of(1, 1, 1)[f]()).toEqual(0);
    })
}


for (const pair of [
    [    0,   1],
    [   -5,   5],
    [-0.99, 1.1],
  ]) {
  const [lBound, uBound] = pair;
  const s = Series.rand(100, lBound - 10, uBound + 10).clip(lBound, uBound);
  test(`after series.clip(${lBound}, ${uBound}) the series does not have any values smaller than (${lBound}) or greater than (${uBound})`, () => {
    for (let i = 0; i < s.length; i++) {
      expect(s[i]).toBeGreaterThanOrEqual(lBound);
      expect(s[i]).toBeLessThanOrEqual(uBound);
    }
  });
}
