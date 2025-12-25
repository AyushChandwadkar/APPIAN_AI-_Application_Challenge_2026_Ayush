/**
 * Knowledge Retrieval Controller
 * Orchestrates semantic search, citation generation, and ranking
 */

import { Request, Response, NextFunction } from 'express';
import { VectorService } from '../services/vectorService';
import { LLMService } from '../services/llmService';
import { CitationService } from '../services/citationService';
import { RankingService } from '../services/rankingService';
import { CacheService } from '../services/cacheService';
import { AuditService } from '../services/auditService';
import { logger } from '../utils/logger';
import { z } from 'zod';

// Request validation schema
const knowledgeRetrievalSchema = z.object({
  caseContext: z.object({
    claimType: z.string(),
    state: z.string().optional(),
    amount: z.number().optional(),
    customerType: z.string().optional(),
    dateOfLoss: z.string().optional(),
    policyType: z.string().optional(),
    metadata: z.record(z.any()).optional()
  }),
  query: z.string().optional(),
  limit: z.number().min(1).max(20).default(5),
  filters: z.object({
    documentTypes: z.array(z.string()).optional(),
    dateRange: z.object({
      start: z.string(),
      end: z.string()
    }).optional(),
    minConfidence: z.number().min(0).max(1).optional(),
    authorities: z.array(z.string()).optional()
  }).optional()
});

export class KnowledgeController {
  private vectorService: VectorService;
  private llmService: LLMService;
  private citationService: CitationService;
  private rankingService: RankingService;
  private cacheService: CacheService;
  private auditService: AuditService;

  constructor() {
    this.vectorService = new VectorService();
    this.llmService = new LLMService();
    this.citationService = new CitationService();
    this.rankingService = new RankingService();
    this.cacheService = new CacheService();
    this.auditService = new AuditService();
  }

  /**
   * Main knowledge retrieval endpoint
   * POST /api/knowledge/retrieve
   */
  public retrieveKnowledge = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    const startTime = Date.now();
    
    try {
      // Validate request
      const validatedData = knowledgeRetrievalSchema.parse(req.body);
      const { caseContext, query, limit, filters } = validatedData;
      const userId = (req as any).user?.id;

      // Generate cache key
      const cacheKey = this.generateCacheKey(caseContext, query, filters);
      
      // Check cache
      const cachedResult = await this.cacheService.get(cacheKey);
      if (cachedResult) {
        logger.info('Cache hit for knowledge retrieval', { cacheKey });
        
        await this.auditService.log({
          userId,
          action: 'KNOWLEDGE_RETRIEVE',
          resourceType: 'KNOWLEDGE',
          details: { cacheHit: true, caseContext },
          ipAddress: req.ip,
          userAgent: req.get('user-agent')
        });

        res.json({
          success: true,
          data: cachedResult,
          metadata: {
            cached: true,
            responseTime: Date.now() - startTime
          }
        });
        return;
      }

      // Build enriched query
      const enrichedQuery = this.buildEnrichedQuery(caseContext, query);
      logger.info('Enriched query generated', { enrichedQuery });

      // Step 1: Semantic search with vector embeddings
      const searchResults = await this.vectorService.semanticSearch(
        enrichedQuery,
        {
          limit: limit * 3, // Over-fetch for ranking
          filters: filters,
          namespace: this.getNamespace(caseContext)
        }
      );

      logger.info(`Retrieved ${searchResults.length} initial results`);

      // Step 2: Rank and filter results
      const rankedResults = await this.rankingService.rankResults(
        searchResults,
        caseContext,
        {
          freshnessWeight: 0.25,
          authorityWeight: 0.30,
          relevanceWeight: 0.45,
          diversityEnabled: true
        }
      );

      // Take top N after ranking
      const topResults = rankedResults.slice(0, limit);

      // Step 3: Generate citations and summaries
      const enrichedResults = await Promise.all(
        topResults.map(async (result) => {
          const [citations, summary] = await Promise.all([
            this.citationService.extractCitations(result.documentId, result.text),
            this.llmService.generateSummary(result.text, caseContext)
          ]);

          return {
            documentId: result.documentId,
            title: result.metadata.title,
            text: result.text,
            summary,
            citations,
            confidenceScore: result.score,
            relevanceScore: result.relevanceScore,
            freshnessScore: result.freshnessScore,
            authorityLevel: result.metadata.authorityLevel,
            documentType: result.metadata.documentType,
            effectiveDate: result.metadata.effectiveDate,
            source: result.metadata.source,
            pageNumber: result.metadata.pageNumber,
            section: result.metadata.section,
            metadata: result.metadata
          };
        })
      );

      // Step 4: Generate compliance disclaimer
      const disclaimer = this.generateComplianceDisclaimer(caseContext);

      // Step 5: Calculate aggregate metrics
      const metrics = {
        totalResults: searchResults.length,
        returnedResults: enrichedResults.length,
        averageConfidence: this.calculateAverageConfidence(enrichedResults),
        searchTime: Date.now() - startTime,
        cacheKey
      };

      const response = {
        success: true,
        data: {
          results: enrichedResults,
          caseContext,
          query: enrichedQuery,
          disclaimer,
          metrics
        },
        metadata: {
          cached: false,
          responseTime: Date.now() - startTime,
          timestamp: new Date().toISOString()
        }
      };

      // Cache the result
      await this.cacheService.set(cacheKey, response.data, 3600); // 1 hour TTL

      // Audit log
      await this.auditService.log({
        userId,
        action: 'KNOWLEDGE_RETRIEVE',
        resourceType: 'KNOWLEDGE',
        details: {
          caseContext,
          query: enrichedQuery,
          resultsCount: enrichedResults.length,
          averageConfidence: metrics.averageConfidence
        },
        ipAddress: req.ip,
        userAgent: req.get('user-agent')
      });

      res.json(response);

    } catch (error) {
      logger.error('Knowledge retrieval error', error);
      next(error);
    }
  };

  /**
   * Get similar cases endpoint
   * POST /api/knowledge/similar-cases
   */
  public getSimilarCases = async (
    req: Request,
    res: Response,
    next: NextFunction
  ): Promise<void> => {
    try {
      const { caseContext, limit = 5 } = req.body;
      const userId = (req as any).user?.id;

      const similarCases = await this.vectorService.findSimilarCases(
        caseContext,
        { limit }
      );

      await this.auditService.log({
        userId,
        action: 'SIMILAR_CASES_RETRIEVE',
        resourceType: 'CASES',
        details: { caseContext, resultsCount: similarCases.length },
        ipAddress: req.ip
      });

      res.json({
        success: true,
        data: similarCases,
        metadata: {
          count: similarCases.length,
          timestamp: new Date().toISOString()
        }
      });

    } catch (error) {
      logger.error('Similar cases retrieval error', error);
      next(error);
    }
  };

  /**
   * Private helper methods
   */

  private buildEnrichedQuery(caseContext: any, userQuery?: string): string {
    const parts: string[] = [];

    if (userQuery) {
      parts.push(userQuery);
    }

    parts.push(`Claim type: ${caseContext.claimType}`);
    
    if (caseContext.state) {
      parts.push(`State: ${caseContext.state}`);
    }
    
    if (caseContext.customerType) {
      parts.push(`Customer type: ${caseContext.customerType}`);
    }
    
    if (caseContext.policyType) {
      parts.push(`Policy type: ${caseContext.policyType}`);
    }

    return parts.join(' | ');
  }

  private getNamespace(caseContext: any): string {
    // Use state-specific namespace if available
    return caseContext.state 
      ? `${caseContext.claimType}_${caseContext.state}`.toLowerCase()
      : caseContext.claimType.toLowerCase();
  }

  private generateCacheKey(caseContext: any, query?: string, filters?: any): string {
    const components = [
      caseContext.claimType,
      caseContext.state,
      caseContext.customerType,
      query,
      JSON.stringify(filters)
    ];
    
    return `knowledge:${components.filter(Boolean).join(':')}`;
  }

  private generateComplianceDisclaimer(caseContext: any): string {
    return `This information is provided for reference purposes only and should not be considered as legal advice. 
Always verify policy details and regulatory requirements before making claim decisions. 
Last updated: ${new Date().toISOString()}. Claim type: ${caseContext.claimType}.`;
  }

  private calculateAverageConfidence(results: any[]): number {
    if (results.length === 0) return 0;
    const sum = results.reduce((acc, r) => acc + r.confidenceScore, 0);
    return Number((sum / results.length).toFixed(3));
  }
}

export default new KnowledgeController();