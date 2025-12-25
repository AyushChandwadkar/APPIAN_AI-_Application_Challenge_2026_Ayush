/**
 * Winston Logger Configuration
 * Structured logging with multiple transports
 */

import winston from 'winston';
import { config } from '../config/env';

// Define log levels
const levels = {
  error: 0,
  warn: 1,
  info: 2,
  http: 3,
  debug: 4,
};

// Define colors for each level
const colors = {
  error: 'red',
  warn: 'yellow',
  info: 'green',
  http: 'magenta',
  debug: 'white',
};

// Add colors to winston
winston.addColors(colors);

// Custom format for console output
const consoleFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.colorize({ all: true }),
  winston.format.printf(
    (info) => `${info.timestamp} ${info.level}: ${info.message}`
  )
);

// Custom format for JSON output
const jsonFormat = winston.format.combine(
  winston.format.timestamp(),
  winston.format.errors({ stack: true }),
  winston.format.metadata(),
  winston.format.json()
);

// Determine which transports to use based on environment
const transports: winston.transport[] = [];

// Console transport for development
if (config.nodeEnv === 'development') {
  transports.push(
    new winston.transports.Console({
      format: consoleFormat,
    })
  );
}

// File transports for production
if (config.nodeEnv === 'production' || config.nodeEnv === 'staging') {
  transports.push(
    new winston.transports.File({
      filename: 'logs/error.log',
      level: 'error',
      format: jsonFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    }),
    new winston.transports.File({
      filename: 'logs/combined.log',
      format: jsonFormat,
      maxsize: 5242880, // 5MB
      maxFiles: 5,
    })
  );
}

// Create the logger
export const logger = winston.createLogger({
  level: config.logLevel || 'info',
  levels,
  transports,
  exitOnError: false,
});

// Stream for Morgan HTTP logging
export const stream = {
  write: (message: string) => {
    logger.http(message.trim());
  },
};

// Helper methods for structured logging
export const logError = (message: string, error: any, metadata?: any) => {
  logger.error(message, {
    error: {
      message: error.message,
      stack: error.stack,
      code: error.code,
    },
    ...metadata,
  });
};

export const logInfo = (message: string, metadata?: any) => {
  logger.info(message, metadata);
};

export const logWarn = (message: string, metadata?: any) => {
  logger.warn(message, metadata);
};

export const logDebug = (message: string, metadata?: any) => {
  logger.debug(message, metadata);
};

// Performance logging helper
export const logPerformance = (
  operation: string,
  startTime: number,
  metadata?: any
) => {
  const duration = Date.now() - startTime;
  logger.info(`Performance: ${operation}`, {
    duration: `${duration}ms`,
    ...metadata,
  });
};

// Audit logging helper
export const logAudit = (
  action: string,
  userId: string,
  details: any
) => {
  logger.info('Audit Log', {
    type: 'AUDIT',
    action,
    userId,
    timestamp: new Date().toISOString(),
    ...details,
  });
};

// Export default logger
export default logger;