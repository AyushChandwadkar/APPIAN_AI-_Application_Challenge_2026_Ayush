/**
 * Environment Configuration Management
 * Validates and exports all environment variables
 */

import dotenv from 'dotenv';
import { z } from 'zod';

dotenv.config();

// Configuration schema with validation
const configSchema = z.object({
  // Server
  nodeEnv: z.enum(['development', 'staging', 'production']).default('development'),
  port: z.coerce.number().default(3000),
  version: z.string().default('1.0.0'),
  
  // CORS
  corsOrigins: z.string().transform(val => val.split(',')).default('http://localhost:3000'),
  
  // Database
  dbHost: z.string(),
  dbPort: z.coerce.number().default(5432),
  dbName: z.string(),
  dbUser: z.string(),
  dbPassword: z.string(),
  dbSslEnabled: z.coerce.boolean().default(false),
  dbPoolMin: z.coerce.number().default(2),
  dbPoolMax: z.coerce.number().default(10),
  
  // Redis
  redisHost: z.string(),
  redisPort: z.coerce.number().default(6379),
  redisPassword: z.string().optional(),
  redisTtl: z.coerce.number().default(3600), // 1 hour default
  
  // Pinecone Vector DB
  pineconeApiKey: z.string(),
  pineconeEnvironment: z.string(),
  pineconeIndexName: z.string().default('knowledge-retrieval'),
  pineconeNamespace: z.string().optional(),
  
  // OpenAI
  openaiApiKey: z.string(),
  openaiModel: z.string().default('gpt-4-turbo-preview'),
  openaiEmbeddingModel: z.string().default('text-embedding-3-large'),
  openaiMaxTokens: z.coerce.number().default(2000),
  openaiTemperature: z.coerce.number().default(0.3),
  
  // Authentication
  jwtSecret: z.string().min(32),
  jwtExpiresIn: z.string().default('24h'),
  oauthClientId: z.string().optional(),
  oauthClientSecret: z.string().optional(),
  oauthRedirectUri: z.string().optional(),
  
  // Rate Limiting
  rateLimitWindowMs: z.coerce.number().default(60000), // 1 minute
  rateLimitMaxRequests: z.coerce.number().default(100),
  
  // Document Ingestion
  maxFileSize: z.coerce.number().default(52428800), // 50MB
  allowedFileTypes: z.string().default('pdf,docx,txt,md,html').transform(val => val.split(',')),
  uploadPath: z.string().default('./uploads'),
  
  // Search Configuration
  maxSearchResults: z.coerce.number().default(20),
  minConfidenceScore: z.coerce.number().default(0.7),
  semanticSearchThreshold: z.coerce.number().default(0.8),
  
  // Logging
  logLevel: z.enum(['error', 'warn', 'info', 'debug']).default('info'),
  logFormat: z.enum(['json', 'simple']).default('json'),
  
  // Audit & Compliance
  auditLogRetentionDays: z.coerce.number().default(2555), // 7 years
  complianceMode: z.coerce.boolean().default(true),
  
  // Performance
  cacheEnabled: z.coerce.boolean().default(true),
  cacheTtl: z.coerce.number().default(3600),
  workerThreads: z.coerce.number().default(4),
  
  // Monitoring
  sentryDsn: z.string().optional(),
  datadogApiKey: z.string().optional(),
});

// Parse and validate environment variables
const parseConfig = () => {
  try {
    return configSchema.parse({
      // Server
      nodeEnv: process.env.NODE_ENV,
      port: process.env.PORT,
      version: process.env.API_VERSION,
      
      // CORS
      corsOrigins: process.env.CORS_ORIGINS,
      
      // Database
      dbHost: process.env.DB_HOST,
      dbPort: process.env.DB_PORT,
      dbName: process.env.DB_NAME,
      dbUser: process.env.DB_USER,
      dbPassword: process.env.DB_PASSWORD,
      dbSslEnabled: process.env.DB_SSL_ENABLED,
      dbPoolMin: process.env.DB_POOL_MIN,
      dbPoolMax: process.env.DB_POOL_MAX,
      
      // Redis
      redisHost: process.env.REDIS_HOST,
      redisPort: process.env.REDIS_PORT,
      redisPassword: process.env.REDIS_PASSWORD,
      redisTtl: process.env.REDIS_TTL,
      
      // Pinecone
      pineconeApiKey: process.env.PINECONE_API_KEY,
      pineconeEnvironment: process.env.PINECONE_ENVIRONMENT,
      pineconeIndexName: process.env.PINECONE_INDEX_NAME,
      pineconeNamespace: process.env.PINECONE_NAMESPACE,
      
      // OpenAI
      openaiApiKey: process.env.OPENAI_API_KEY,
      openaiModel: process.env.OPENAI_MODEL,
      openaiEmbeddingModel: process.env.OPENAI_EMBEDDING_MODEL,
      openaiMaxTokens: process.env.OPENAI_MAX_TOKENS,
      openaiTemperature: process.env.OPENAI_TEMPERATURE,
      
      // Authentication
      jwtSecret: process.env.JWT_SECRET,
      jwtExpiresIn: process.env.JWT_EXPIRES_IN,
      oauthClientId: process.env.OAUTH_CLIENT_ID,
      oauthClientSecret: process.env.OAUTH_CLIENT_SECRET,
      oauthRedirectUri: process.env.OAUTH_REDIRECT_URI,
      
      // Rate Limiting
      rateLimitWindowMs: process.env.RATE_LIMIT_WINDOW_MS,
      rateLimitMaxRequests: process.env.RATE_LIMIT_MAX_REQUESTS,
      
      // Document Ingestion
      maxFileSize: process.env.MAX_FILE_SIZE,
      allowedFileTypes: process.env.ALLOWED_FILE_TYPES,
      uploadPath: process.env.UPLOAD_PATH,
      
      // Search
      maxSearchResults: process.env.MAX_SEARCH_RESULTS,
      minConfidenceScore: process.env.MIN_CONFIDENCE_SCORE,
      semanticSearchThreshold: process.env.SEMANTIC_SEARCH_THRESHOLD,
      
      // Logging
      logLevel: process.env.LOG_LEVEL,
      logFormat: process.env.LOG_FORMAT,
      
      // Audit
      auditLogRetentionDays: process.env.AUDIT_LOG_RETENTION_DAYS,
      complianceMode: process.env.COMPLIANCE_MODE,
      
      // Performance
      cacheEnabled: process.env.CACHE_ENABLED,
      cacheTtl: process.env.CACHE_TTL,
      workerThreads: process.env.WORKER_THREADS,
      
      // Monitoring
      sentryDsn: process.env.SENTRY_DSN,
      datadogApiKey: process.env.DATADOG_API_KEY,
    });
  } catch (error) {
    if (error instanceof z.ZodError) {
      console.error('❌ Invalid environment configuration:');
      error.errors.forEach(err => {
        console.error(`  - ${err.path.join('.')}: ${err.message}`);
      });
      process.exit(1);
    }
    throw error;
  }
};

export const config = parseConfig();

// Helper function to check if running in production
export const isProduction = () => config.nodeEnv === 'production';
export const isDevelopment = () => config.nodeEnv === 'development';
export const isStaging = () => config.nodeEnv === 'staging';