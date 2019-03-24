const { readFileSync } = require('fs');
const parseCSV = require('csv-parse/lib/sync');

/**
 * @param {!String} filePath
 * @returns {JSON}
 */
function readJSON(filePath) {
  return JSON.parse(readFileSync(filePath).toString('utf-8'));
}

/**
 * @param {!String} filePath
 * @param {?Boolean} [hasHeader]
 * @returns {Array<Array<String>>} table
 */
function readCSV(filePath, hasHeader = false) {
  return parseCSV(readFileSync(filePath), {
      header: hasHeader,
      skip_empty_lines: true,
    });
}

module.exports = { readCSV, readJSON };
