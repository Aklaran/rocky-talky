import pino, { LoggerOptions } from 'pino'
import { LogLevel } from '../constants/logLevels'

const isDevelopment = process.env.NODE_ENV !== 'production'

const getLogLevel = (): LogLevel => {
  const envLogLevel = process.env.LOG_LEVEL?.toLowerCase()

  if (envLogLevel) {
    const validLevels = Object.values(LogLevel) as string[]
    if (validLevels.includes(envLogLevel)) {
      return envLogLevel as LogLevel
    }
    console.warn(
      `Invalid LOG_LEVEL "${envLogLevel}". Valid levels: ${validLevels.join(', ')}. Falling back to default.`,
    )
  }

  return isDevelopment ? LogLevel.DEBUG : LogLevel.INFO
}

const getTransport = () => {
  if (isDevelopment) {
    return {
      target: 'pino-pretty',
      options: { colorize: true },
    }
  }

  return {
    target: 'pino-pretty',
    options: {
      colorize: true,
      destination: 1,
    },
  }
}

const options: LoggerOptions = {
  level: getLogLevel(),
  transport: getTransport(),
}

const logger = pino(options)

export default logger
