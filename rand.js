/**
 * @param {number} a min val
 * @param {?number} [b] max val
 * @returns {number} random number
 * @private
 */
const randInRange = (a, b = null) =>
  b === null
    ? randInRange(0, a)
    : a + (b - a) * Math.random();

/**
 * @param {number} a min val
 * @param {number} [b] max val
 * @returns {number} random number
 * @private
 */
const randInt = (a, b) => Math.floor(randInRange(a, b));

module.exports = {
  randInRange,
  randInt
};
