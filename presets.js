const PROGRAMMER_PRINTING = {
  DOTS: '..',
  EMPTY_STR: '--',
  IDX_MARKER: 'hex',
  INDEX_BASE: 16,
  MEM_INFO: true,
  MEM_INFO_INDEX: '--',
  MEM_INFO_STR: '--',
  MIN_COL_WIDTH: 12,
  PAD_STR: ' ',
  PRINT_TYPES: false,
  PRINT_TYPES: true,
  SHOW_MORE: true,
  SPACE_BETWEEN: 3,
  UNDERLINE: ' ',
  UNDERLINE_BOT: true,
};

const DEFAULT_PRINTING = {
  DOTS: '..',
  EMPTY_STR: 'empty',
  IDX_MARKER: '#',
  INDEX_BASE: 10,
  MEM_INFO: true,
  MEM_INFO_INDEX: '',
  MEM_INFO_STR: '',
  MIN_COL_WIDTH: 10,
  PAD_STR: ' ',
  PRINT_TYPES: true,
  SHOW_MORE: true,
  SPACE_BETWEEN: 1,
  UNDERLINE: '-',
  UNDERLINE_BOT: true,
};

const MINIMAL_PRINTING = {
  DOTS: '.',
  EMPTY_STR: '-',
  IDX_MARKER: '',
  MEM_INFO: false,
  MEM_INFO_INDEX: '',
  MEM_INFO_STR: '',
  MIN_COL_WIDTH: 12,
  PAD_STR: ' ',
  PRINT_TYPES: false,
  SHOW_MORE: false,
  SPACE_BETWEEN: 2,
  UNDERLINE: ' ',
  UNDERLINE_BOT: true,
};

module.exports = {
  mini: MINIMAL_PRINTING,
  prog: PROGRAMMER_PRINTING,
  def: DEFAULT_PRINTING
};
