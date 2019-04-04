/**
 * @param {!Number} n
 * @param {!Number} [prec]
 * @private
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

/**
 *
 * @param {!Number|!String} xs
 * @returns {'s'|'f64'|'f34'|'i32'|'i16'|'i8'|'u32'|'u16'|'u8'} type marker
 */
function getTypeMarker(val) {
  if (val.constructor.name[0] === 'S') {
    return 's';
  }
  const isFloat = !Number.isInteger(val);
  if (isFloat) {
    return `f${env.FLOAT_PREC}`;
  }
  let bitsNeeded = Math.ceil(Math.log(val + 1));
  const isNeg = val < 0;
  if (isNeg) bitsNeeded++;
  let bits = null;

  for (const bound of [32, 16, 8]) {
    if (bitsNeeded <= bound) {
      bits = bound;
    }
  }

  if (bits === null) {
    return 'f64';
  }

  const type = isNeg ? 'i' : 'u';
  return `${type}${bits}`;
}


/**
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dt1
 * @param {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dt2
 * @returns {"f32"|"f64"|"i8"|"16"|"i32"|"u8"|"u16"|"u32"|"s"} dtype
 * @private
 */
function unify(dt1, dt2) {
  if (dt1[0] === 's' || dt2[0] === 's') {
    return 's';
  } else if (dt1[0] === dt2[0]) {
    const nBits = Math.max(bitRegex.exec(dt1)[0], bitRegex.exec(dt2)[0]);
    return dt1[0] + nBits.toString();
  } else if (dt1[0] === 'f') {
    return dt1;
  } else if (dt2[0] === 'f') {
    return dt2;
  } else if (dt1[0] === 'i') {
    const bits1 = bitRegex.exec(dt1)[0];
    const bits2 = bitRegex.exec(dt2)[0];
    return `i${Math.min(32, Math.max(bits1, bits2 * 2))}`;
  } else if (dt2[0] === 'i') {
    const bits1 = bitRegex.exec(dt1)[0];
    const bits2 = bitRegex.exec(dt2)[0];
    return `i${Math.min(32, Math.max(bits1 * 2, bits2))}`;
  }
}

module.exports = {
  getTypeMarker,
  unify,
  fmtFloat,
};
