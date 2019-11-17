const winston = require('winston');
const util = require('util');

const { createLogger, format, transports } = winston;

const fmt = format.combine(
  format.splat(),
  format.printf(({ level, message }) => util.format('%s %s', `[${level.toLocaleUpperCase()}]`.padEnd(7, ' '), message)),
);

/**
 * @type {winston.Logger}
 */
const log = createLogger(process.env.NODE_ENV === 'production' ? {
  format: fmt,
  level: 'info',
  transports: [
    new transports.File({ filename: 'info.log', level: 'info' }),
    new transports.Console({ level: 'warn' }),
  ],
} : {
  format: fmt,
  level: 'debug',
  transports: [new transports.Console()],
});

module.exports = log;
