const { add, factorial, sampleWR, sampleWOR, randInt, zipWith, replicate, concat, toTypedArray: toTA, manhDist, repeat } = require('.');

const NO_TESTS = 100;

test('replicate [1,2,3] x2 gives [1,2,3,1,2,3]', () => {
  // array
  expect(replicate([1, 2, 3], 2)).toEqual([
    1, 2, 3, 1, 2, 3,
  ]);
  // typed array
  expect(Array.from(replicate(toTA([1, 2, 3]), 2))).toEqual([
    1, 2, 3, 1, 2, 3,
  ]);
});

test('concat typed arrays [-1,2,3], [3,4.5] and [] is [-1,2,3,3,4.5]', () => {
  const a1 = toTA([-1, 2, 3]);
  const a2 = toTA([3, 4.5]);
  const a3 = toTA([]);
  const expected = toTA([
    -1, 2, 3, 3, 4.5,
  ]);
  const result = concat(concat(a1, a2), a3);
  expect(Array.from(result)).toEqual(Array.from(expected));
});

test('manhattan distance between [0,-8,33] and [99] id 99', () => {
  expect(manhDist([0, -8, 99], [99])).toBe(99);
});

test('manhattan distance between [10,-8,33] and [0,0,0,0] id 10 + 8 + 33', () => {
  const expected = 10 + 8 + 33;
  const xs = [10, -8, 33];
  const ys = [
    0, 0, 0, 0,
  ];
  // array
  expect(manhDist(xs, ys)).toBe(expected);
  // typed array
  expect(manhDist(toTA(xs), toTA(ys))).toBe(expected);
});

test('repeat [1,-9] x3 gives [1,-9,1,-9,1,-9]', () => {
  const expected = [
    1, -9, 1, -9, 1, -9,
  ];
  const result = repeat(expected, 2);
  expect(result).toEqual(expected);
});

test('zipWith([1,2,3], [-9,3], (x, y) => x + y) is [8,5]', () => {
  // array
  expect(zipWith([1, 2, 3], [-9, 3], (x, y) => x + y)).toEqual([-8, 5]);
  // typed array
  const expected2 = [8, 5];
  const result2 = Array.from(zipWith(toTA([1, 2, 3]), toTA([-9, 3]), (x, y) => x + y));
  expect(result2).toEqual(expected2);
});

test('zipWith3([2,3], [0,3], [1,1,1],  (x, y, z) => x * y * z) is [0,9]', () => {
  // array
  const expected = [0, 9];
  const result = zipWith([2, 3], [0, 3], [1, 1, 1], (x, y, z) => x * y);
  expect(result).toEqual(expected);
  // typed array
  const expected2 = [0, 9];
  const result2 = zipWith(toTA([2, 3]), toTA([0, 3]), toTA([1, 1, 1]), (x, y, z) => x * y);
  expect(Array.from(result2)).toEqual(expected2);
});

test('randInt(n, m) to be between n and m (exclusive)', () => {
  for (let i = 0; i < NO_TESTS; i++) {
    const result = randInt(10, 100);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeLessThan(100);
    expect(result).toBeGreaterThanOrEqual(10);
  }
  for (let i = 0; i < NO_TESTS; i++) {
    const result = randInt(-10, 10);
    expect(Number.isInteger(result)).toBe(true);
    expect(result).toBeLessThan(10);
    expect(result).toBeGreaterThanOrEqual(-10);
  }
});

test('sample without replacement not to include sampled items', () => {
  const result = sampleWOR([1, 2, 3], 2);
  expect(result).toHaveLength(2);
  expect(result.some(x => x !== 1 && x !== 2 && x !== 3)).toBe(false);
  expect(new Set(result).size).toBe(2);
});

test('sample of size 2 with replacement to have 2 items and only items from population', () => {
  const result = sampleWR([1, 2, 3], 2);
  expect(result).toHaveLength(2);
  expect(result.some(x => x !== 1 && x !== 2 && x !== 3)).toBe(false);
});

test('4! = 1 * 2 * 3 * 4, !1 = 1', () => {
  expect(factorial(1)).toBe(1);
  expect(factorial(4)).toBe(1 * 2 * 3 * 4);
});

test('vector scalar addition with neg nums', () => {
  expect(add([-88, 2, 3], 1)).toEqual([-87, 3, 4]);
  expect(Array.from(add(toTA([1, 2, 3]), 1))).toEqual([-87, 3, 4]);
});

test('vector scalar addition with floats', () => {
  expect(add([-8, 2.2], 1)).toEqual([-7, 3.2]);
  expect(Array.from(add(toTA([-8, 2.2]), 1))).toEqual([-7, 3.2]);
});
