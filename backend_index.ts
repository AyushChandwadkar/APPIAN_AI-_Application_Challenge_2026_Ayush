/**
 * Main Express Server Entry Point
 * Intelligent Knowledge Retrieval System for Appian
 */

import express, { Application } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import { config } from './config/env';
import { errorHandler } from './middleware/errorHandler';
import { authMiddleware } from './middleware/auth';
import { rateLimitMiddleware } from './middleware/rateLimit';
import knowledgeRoutes from './routes/knowledge.routes';
import citationRoutes from './routes/citations.routes';
import auditRoutes from './routes/audit.routes';
import documentRoutes from './routes/document.routes';
import searchRoutes from './routes/search.routes';
import { connectDatabase } from './database/connection';
import { connectRedis } from './services/cacheService';
import { logger } from './utils/logger';

class KnowledgeRetrievalServer {
  private app: Application;
  private port: number;

  constructor() {
    this.app = express();
    this.port = config.port;
    this.initializeMiddleware();
    this.initializeRoutes();
    this.initializeErrorHandling();
  }

  private initializeMiddleware(): void {
    // Security middleware
    this.app.use(helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          styleSrc: ["'self'", "'unsafe-inline'"],
          scriptSrc: ["'self'"],
          imgSrc: ["'self'", "data:", "https:"],
        },
      },
      hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
      }
    }));

    // CORS configuration
    this.app.use(cors({
      origin: config.corsOrigins,
      credentials: true,
      methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'],
      allowedHeaders: ['Content-Type', 'Authorization']
    }));

    // Compression and parsing
    this.app.use(compression());
    this.app.use(express.json({ limit: '10mb' }));
    this.app.use(express.urlencoded({ extended: true, limit: '10mb' }));

    // Rate limiting
    this.app.use(rateLimitMiddleware);

    // Request logging
    this.app.use((req, res, next) => {
      logger.info(`${req.method} ${req.path}`, {
        ip: req.ip,
        userAgent: req.get('user-agent')
      });
      next();
    });
  }

  private initializeRoutes(): void {
    // Health check endpoint
    this.app.get('/health', (req, res) => {
      res.json({
        status: 'healthy',
        timestamp: new Date().toISOString(),
        uptime: process.uptime(),
        version: config.version
      });
    });

    // API routes with authentication
    this.app.use('/api/knowledge', authMiddleware, knowledgeRoutes);
    this.app.use('/api/citations', authMiddleware, citationRoutes);
    this.app.use('/api/audit', authMiddleware, auditRoutes);
    this.app.use('/api/documents', authMiddleware, documentRoutes);
    this.app.use('/api/search', authMiddleware, searchRoutes);

    // 404 handler
    this.app.use((req, res) => {
      res.status(404).json({
        success: false,
        error: 'Endpoint not found',
        path: req.path
      });
    });
  }

  private initializeErrorHandling(): void {
    this.app.use(errorHandler);
  }

  public async start(): Promise<void> {
    try {
      // Connect to database
      await connectDatabase();
      logger.info('PostgreSQL connected successfully');

      // Connect to Redis
      await connectRedis();
      logger.info('Redis connected successfully');

      // Start server
      this.app.listen(this.port, () => {
        logger.info(`🚀 Knowledge Retrieval API running on port ${this.port}`);
        logger.info(`Environment: ${config.nodeEnv}`);
        logger.info(`API Version: ${config.version}`);
      });
    } catch (error) {
      logger.error('Failed to start server', error);
      process.exit(1);
    }
  }
}

// Graceful shutdown
process.on('SIGTERM', () => {
  logger.info('SIGTERM received, shutting down gracefully');
  process.exit(0);
});

process.on('SIGINT', () => {
  logger.info('SIGINT received, shutting down gracefully');
  process.exit(0);
});

// Start server
const server = new KnowledgeRetrievalServer();
server.start();

export default server;