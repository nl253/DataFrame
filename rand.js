/**
 * @param {!Number} a min val
 * @param {?Number} [b] max val
 * @returns {!Number} random number
 */
function randInRange(a, b = null) {
  return b === null ?
    randInRange(0, a) :
    a + (b - a) * Math.random();
}

/**
 * @param {!Number} a min val
 * @param {!Number} [b] max val
 * @returns {!Number} random number
 */
function randInt(a, b) {
  return Math.floor(randInRange(a, b));
}

module.exports = {
  randInRange,
  randInt
};
