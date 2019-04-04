const winston = require('winston');

const { createLogger, format, transports } = winston;

/**
 * @type {winston.Logger}
 */
const log = createLogger({
  format: format.combine(
    format.splat(),
    format.printf(
      ({ level, message }) => `[${level.toLocaleUpperCase()}] ${message}`,
    ),
  ),
  level: 'debug',
  transports: [new transports.File({ filename: 'error.log', level: 'error' }), new transports.File({ filename: 'log.log' })],
});

if (process.env.NODE_ENV !== 'production') {
  log.add(new transports.Console());
}

module.exports = log;
