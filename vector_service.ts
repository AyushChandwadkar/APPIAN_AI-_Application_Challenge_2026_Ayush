/**
 * Vector Service - Pinecone Integration
 * Handles semantic search and vector embeddings
 */

import { Pinecone } from '@pinecone-database/pinecone';
import { OpenAI } from 'openai';
import { config } from '../config/env';
import { logger } from '../utils/logger';

interface SearchOptions {
  limit?: number;
  filters?: {
    documentTypes?: string[];
    dateRange?: { start: string; end: string };
    minConfidence?: number;
    authorities?: string[];
  };
  namespace?: string;
  includeMetadata?: boolean;
}

interface SearchResult {
  documentId: string;
  text: string;
  score: number;
  relevanceScore: number;
  freshnessScore: number;
  metadata: {
    title: string;
    documentType: string;
    authorityLevel: string;
    effectiveDate: string;
    source: string;
    pageNumber?: number;
    section?: string;
    tags?: string[];
    [key: string]: any;
  };
}

export class VectorService {
  private pinecone: Pinecone;
  private openai: OpenAI;
  private indexName: string;

  constructor() {
    this.pinecone = new Pinecone({
      apiKey: config.pineconeApiKey,
      environment: config.pineconeEnvironment,
    });
    
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    
    this.indexName = config.pineconeIndexName;
  }

  /**
   * Perform semantic search using vector embeddings
   */
  public async semanticSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      const {
        limit = 10,
        filters,
        namespace,
        includeMetadata = true
      } = options;

      logger.info('Performing semantic search', { query, namespace, limit });

      // Generate query embedding
      const queryEmbedding = await this.generateEmbedding(query);

      // Build Pinecone filter
      const pineconeFilter = this.buildPineconeFilter(filters);

      // Query Pinecone index
      const index = this.pinecone.Index(this.indexName);
      const queryResponse = await index.namespace(namespace || '').query({
        vector: queryEmbedding,
        topK: limit,
        includeMetadata,
        filter: pineconeFilter,
      });

      // Transform results
      const results: SearchResult[] = queryResponse.matches.map(match => ({
        documentId: match.id,
        text: match.metadata?.text as string || '',
        score: match.score || 0,
        relevanceScore: match.score || 0,
        freshnessScore: this.calculateFreshnessScore(match.metadata?.effectiveDate as string),
        metadata: {
          title: match.metadata?.title as string || 'Untitled',
          documentType: match.metadata?.documentType as string || 'Unknown',
          authorityLevel: match.metadata?.authorityLevel as string || 'Standard',
          effectiveDate: match.metadata?.effectiveDate as string || '',
          source: match.metadata?.source as string || '',
          pageNumber: match.metadata?.pageNumber as number,
          section: match.metadata?.section as string,
          tags: match.metadata?.tags as string[] || [],
          ...match.metadata
        }
      }));

      logger.info(`Found ${results.length} semantic search results`);
      return results;

    } catch (error) {
      logger.error('Semantic search error', error);
      throw new Error(`Semantic search failed: ${error.message}`);
    }
  }

  /**
   * Generate embedding for text using OpenAI
   */
  public async generateEmbedding(text: string): Promise<number[]> {
    try {
      const response = await this.openai.embeddings.create({
        model: config.openaiEmbeddingModel,
        input: text.substring(0, 8000), // Limit to 8k chars
      });

      return response.data[0].embedding;
    } catch (error) {
      logger.error('Embedding generation error', error);
      throw new Error(`Failed to generate embedding: ${error.message}`);
    }
  }

  /**
   * Upsert document vectors to Pinecone
   */
  public async upsertVectors(
    vectors: Array<{
      id: string;
      values: number[];
      metadata: Record<string, any>;
    }>,
    namespace?: string
  ): Promise<void> {
    try {
      const index = this.pinecone.Index(this.indexName);
      
      // Batch upsert (max 100 vectors per batch)
      const batchSize = 100;
      for (let i = 0; i < vectors.length; i += batchSize) {
        const batch = vectors.slice(i, i + batchSize);
        await index.namespace(namespace || '').upsert(batch);
      }

      logger.info(`Upserted ${vectors.length} vectors to Pinecone`, { namespace });
    } catch (error) {
      logger.error('Vector upsert error', error);
      throw new Error(`Failed to upsert vectors: ${error.message}`);
    }
  }

  /**
   * Delete vectors from Pinecone
   */
  public async deleteVectors(ids: string[], namespace?: string): Promise<void> {
    try {
      const index = this.pinecone.Index(this.indexName);
      await index.namespace(namespace || '').deleteMany(ids);
      logger.info(`Deleted ${ids.length} vectors from Pinecone`, { namespace });
    } catch (error) {
      logger.error('Vector deletion error', error);
      throw new Error(`Failed to delete vectors: ${error.message}`);
    }
  }

  /**
   * Find similar cases based on case context
   */
  public async findSimilarCases(
    caseContext: any,
    options: { limit?: number } = {}
  ): Promise<any[]> {
    try {
      const { limit = 5 } = options;

      // Build case description for embedding
      const caseDescription = `
        Claim Type: ${caseContext.claimType}
        State: ${caseContext.state || 'N/A'}
        Amount: ${caseContext.amount || 'N/A'}
        Customer Type: ${caseContext.customerType || 'N/A'}
        Policy Type: ${caseContext.policyType || 'N/A'}
      `.trim();

      // Search for similar cases
      const results = await this.semanticSearch(caseDescription, {
        limit,
        filters: {
          documentTypes: ['CASE', 'CLAIM']
        },
        namespace: 'cases'
      });

      return results.map(result => ({
        caseId: result.documentId,
        similarity: result.score,
        claimType: result.metadata.claimType,
        resolution: result.metadata.resolution,
        outcome: result.metadata.outcome,
        daysToResolve: result.metadata.daysToResolve,
        metadata: result.metadata
      }));

    } catch (error) {
      logger.error('Similar cases search error', error);
      throw new Error(`Failed to find similar cases: ${error.message}`);
    }
  }

  /**
   * Hybrid search combining semantic and keyword search
   */
  public async hybridSearch(
    query: string,
    options: SearchOptions = {}
  ): Promise<SearchResult[]> {
    try {
      // Perform semantic search
      const semanticResults = await this.semanticSearch(query, options);

      // TODO: Implement keyword search and merge results
      // For now, return semantic results
      return semanticResults;

    } catch (error) {
      logger.error('Hybrid search error', error);
      throw new Error(`Hybrid search failed: ${error.message}`);
    }
  }

  /**
   * Private helper methods
   */

  private buildPineconeFilter(filters?: SearchOptions['filters']): Record<string, any> | undefined {
    if (!filters) return undefined;

    const filter: Record<string, any> = {};

    if (filters.documentTypes && filters.documentTypes.length > 0) {
      filter.documentType = { $in: filters.documentTypes };
    }

    if (filters.dateRange) {
      filter.effectiveDate = {
        $gte: filters.dateRange.start,
        $lte: filters.dateRange.end
      };
    }

    if (filters.authorities && filters.authorities.length > 0) {
      filter.authorityLevel = { $in: filters.authorities };
    }

    return Object.keys(filter).length > 0 ? filter : undefined;
  }

  private calculateFreshnessScore(effectiveDate: string): number {
    if (!effectiveDate) return 0.5;

    try {
      const date = new Date(effectiveDate);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      // Exponential decay: score decreases over time
      // 100% at 0 days, 90% at 30 days, 50% at 365 days
      const decayRate = 0.002; // Adjust for desired decay
      const score = Math.exp(-decayRate * daysDiff);

      return Math.max(0.1, Math.min(1.0, score)); // Clamp between 0.1 and 1.0
    } catch (error) {
      logger.warn('Failed to calculate freshness score', { effectiveDate });
      return 0.5;
    }
  }

  /**
   * Get index statistics
   */
  public async getIndexStats(namespace?: string): Promise<any> {
    try {
      const index = this.pinecone.Index(this.indexName);
      const stats = await index.describeIndexStats();
      
      return {
        dimension: stats.dimension,
        indexFullness: stats.indexFullness,
        totalVectorCount: stats.totalRecordCount,
        namespaces: stats.namespaces
      };
    } catch (error) {
      logger.error('Failed to get index stats', error);
      throw error;
    }
  }
}

export default VectorService;