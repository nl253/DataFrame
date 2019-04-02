/**
 * @param {!Number} n
 * @param {!Number} [prec]
 */
function fmtFloat(n, prec = 2) {
  const s = n.toString();
  const maybePointIdx = s.indexOf('.');
  if (maybePointIdx >= 0) {
    return `${s.slice(0, maybePointIdx)}.${s.slice(maybePointIdx + 1, maybePointIdx + 1 + prec)}`;
  } else {
    return s;
  }
}

module.exports = {
  fmtFloat,
};
