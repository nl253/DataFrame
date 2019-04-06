const { resolve } = require('path');
const env = {
  HEAD_LEN: 5,
  PARSE_NUM_RATIO: 0.7,
  SAMPLE_SIZE: 0.1,
  NBEST: 5,
  DATASETS: [resolve(__dirname, 'datasets')],
  FLOAT_PREC: 32,
  PRINT_PREC: 2,
  MIN_COL_WIDTH: 13,
};

module.exports = env;
