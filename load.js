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
 * @returns {Array<Array<String>>} table
 */
function readCSV(filePath) {
  return parseCSV(readFileSync(filePath), {
    skip_empty_lines: true,
  });
}

module.exports = { readCSV, readJSON };
