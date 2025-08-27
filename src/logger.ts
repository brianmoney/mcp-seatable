import pino, { Logger } from 'pino'

export const logger: Logger = pino({
  level: process.env.LOG_LEVEL || 'info',
  base: undefined, // do not add pid/hostname
  redact: ['req.headers.authorization', 'config.headers.Authorization'],
  timestamp: pino.stdTimeFunctions.isoTime,
})

export function withRequest<T extends Record<string, unknown>>(fields: T) {
  return logger.child(fields)
}
