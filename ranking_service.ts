/**
 * Ranking Service
 * Multi-factor ranking algorithm for search results
 */

import { logger } from '../utils/logger';

interface RankingOptions {
  freshnessWeight?: number;      // 0-1, weight for document freshness
  authorityWeight?: number;      // 0-1, weight for authority level
  relevanceWeight?: number;      // 0-1, weight for semantic relevance
  diversityEnabled?: boolean;    // Enable result diversity
  boostFactors?: {
    documentTypes?: Record<string, number>;
    authorities?: Record<string, number>;
  };
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
    tags?: string[];
    [key: string]: any;
  };
}

export class RankingService {
  private defaultOptions: RankingOptions = {
    freshnessWeight: 0.25,
    authorityWeight: 0.30,
    relevanceWeight: 0.45,
    diversityEnabled: true
  };

  /**
   * Rank search results using multi-factor algorithm
   */
  public async rankResults(
    results: SearchResult[],
    caseContext: any,
    options: RankingOptions = {}
  ): Promise<SearchResult[]> {
    try {
      const opts = { ...this.defaultOptions, ...options };
      
      logger.info('Ranking results', {
        count: results.length,
        weights: {
          freshness: opts.freshnessWeight,
          authority: opts.authorityWeight,
          relevance: opts.relevanceWeight
        }
      });

      // Calculate composite scores
      const scoredResults = results.map(result => ({
        ...result,
        compositeScore: this.calculateCompositeScore(result, opts, caseContext),
        freshnessScore: this.calculateFreshnessScore(result.metadata.effectiveDate),
        authorityScore: this.calculateAuthorityScore(result.metadata.authorityLevel),
      }));

      // Sort by composite score
      let rankedResults = scoredResults.sort((a, b) => b.compositeScore - a.compositeScore);

      // Apply diversity filter if enabled
      if (opts.diversityEnabled) {
        rankedResults = this.applyDiversityFilter(rankedResults);
      }

      logger.info('Ranking complete', {
        topScore: rankedResults[0]?.compositeScore,
        bottomScore: rankedResults[rankedResults.length - 1]?.compositeScore
      });

      return rankedResults;

    } catch (error) {
      logger.error('Ranking error', error);
      return results; // Return unranked on error
    }
  }

  /**
   * Calculate composite score from multiple factors
   */
  private calculateCompositeScore(
    result: SearchResult,
    options: RankingOptions,
    caseContext: any
  ): number {
    const relevanceScore = result.score || 0;
    const freshnessScore = this.calculateFreshnessScore(result.metadata.effectiveDate);
    const authorityScore = this.calculateAuthorityScore(result.metadata.authorityLevel);

    // Apply context-specific boosts
    const contextBoost = this.calculateContextBoost(result, caseContext);
    
    // Apply document type boost
    const typeBoost = options.boostFactors?.documentTypes?.[result.metadata.documentType] || 1.0;
    
    // Apply authority boost
    const authorityBoost = options.boostFactors?.authorities?.[result.metadata.authorityLevel] || 1.0;

    // Weighted composite score
    const baseScore = 
      (relevanceScore * (options.relevanceWeight || 0.45)) +
      (freshnessScore * (options.freshnessWeight || 0.25)) +
      (authorityScore * (options.authorityWeight || 0.30));

    // Apply boosts
    const boostedScore = baseScore * contextBoost * typeBoost * authorityBoost;

    return Math.min(1.0, boostedScore); // Cap at 1.0
  }

  /**
   * Calculate freshness score with exponential decay
   */
  private calculateFreshnessScore(effectiveDate: string): number {
    if (!effectiveDate) return 0.5;

    try {
      const date = new Date(effectiveDate);
      const now = new Date();
      const daysDiff = Math.floor((now.getTime() - date.getTime()) / (1000 * 60 * 60 * 24));

      // Scoring tiers
      if (daysDiff < 30) return 1.0;        // Perfect score for <30 days
      if (daysDiff < 90) return 0.95;       // Recent: <3 months
      if (daysDiff < 180) return 0.90;      // <6 months
      if (daysDiff < 365) return 0.80;      // <1 year
      if (daysDiff < 730) return 0.65;      // <2 years
      if (daysDiff < 1095) return 0.50;     // <3 years
      if (daysDiff < 1825) return 0.35;     // <5 years
      
      // Exponential decay after 5 years
      const decayRate = 0.0005;
      return Math.max(0.1, Math.exp(-decayRate * daysDiff));

    } catch (error) {
      logger.warn('Failed to calculate freshness score', { effectiveDate });
      return 0.5;
    }
  }

  /**
   * Calculate authority score based on document source
   */
  private calculateAuthorityScore(authorityLevel: string): number {
    const authorityScores: Record<string, number> = {
      'FEDERAL_REGULATION': 1.0,
      'STATE_REGULATION': 0.95,
      'COMPANY_POLICY': 0.85,
      'INDUSTRY_STANDARD': 0.80,
      'BEST_PRACTICE': 0.75,
      'INTERNAL_GUIDELINE': 0.70,
      'REFERENCE': 0.60,
      'STANDARD': 0.50
    };

    return authorityScores[authorityLevel?.toUpperCase()] || 0.5;
  }

  /**
   * Calculate context-specific boost
   */
  private calculateContextBoost(result: SearchResult, caseContext: any): number {
    let boost = 1.0;

    // Exact claim type match
    if (result.metadata.claimType === caseContext.claimType) {
      boost *= 1.2;
    }

    // State-specific boost
    if (result.metadata.state === caseContext.state) {
      boost *= 1.15;
    }

    // Customer type match
    if (result.metadata.customerType === caseContext.customerType) {
      boost *= 1.1;
    }

    // Policy type match
    if (result.metadata.policyType === caseContext.policyType) {
      boost *= 1.1;
    }

    // Tag relevance
    if (result.metadata.tags && caseContext.tags) {
      const tagOverlap = this.calculateTagOverlap(
        result.metadata.tags,
        caseContext.tags
      );
      boost *= (1 + tagOverlap * 0.1); // Max 10% boost from tags
    }

    return Math.min(boost, 1.5); // Cap total boost at 50%
  }

  /**
   * Apply diversity filter to avoid similar results
   */
  private applyDiversityFilter(results: SearchResult[]): SearchResult[] {
    if (results.length <= 5) return results;

    const diverseResults: SearchResult[] = [];
    const seenTypes = new Set<string>();
    const seenSources = new Set<string>();

    // First pass: Add top result and enforce diversity
    for (const result of results) {
      const type = result.metadata.documentType;
      const source = result.metadata.source;

      // Always include top 2 results
      if (diverseResults.length < 2) {
        diverseResults.push(result);
        seenTypes.add(type);
        seenSources.add(source);
        continue;
      }

      // Enforce diversity: avoid too many same types/sources
      const typeCount = diverseResults.filter(r => r.metadata.documentType === type).length;
      const sourceCount = diverseResults.filter(r => r.metadata.source === source).length;

      if (typeCount < 3 && sourceCount < 2) {
        diverseResults.push(result);
        seenTypes.add(type);
        seenSources.add(source);
      }

      if (diverseResults.length >= results.length) break;
    }

    // Fill remaining slots if needed
    for (const result of results) {
      if (diverseResults.length >= results.length) break;
      if (!diverseResults.includes(result)) {
        diverseResults.push(result);
      }
    }

    logger.info('Diversity filter applied', {
      original: results.length,
      diverse: diverseResults.length,
      uniqueTypes: seenTypes.size,
      uniqueSources: seenSources.size
    });

    return diverseResults;
  }

  /**
   * Calculate tag overlap between result and context
   */
  private calculateTagOverlap(tags1: string[], tags2: string[]): number {
    if (!tags1 || !tags2 || tags1.length === 0 || tags2.length === 0) return 0;

    const set1 = new Set(tags1.map(t => t.toLowerCase()));
    const set2 = new Set(tags2.map(t => t.toLowerCase()));
    
    const intersection = new Set([...set1].filter(t => set2.has(t)));
    const union = new Set([...set1, ...set2]);

    return intersection.size / union.size;
  }

  /**
   * Re-rank results based on user feedback
   */
  public async reRankWithFeedback(
    results: SearchResult[],
    feedback: Array<{ documentId: string; helpful: boolean }>
  ): Promise<SearchResult[]> {
    const feedbackMap = new Map(
      feedback.map(f => [f.documentId, f.helpful ? 1.1 : 0.9])
    );

    return results.map(result => ({
      ...result,
      compositeScore: (result.compositeScore || result.score) * 
        (feedbackMap.get(result.documentId) || 1.0)
    })).sort((a, b) => (b.compositeScore || 0) - (a.compositeScore || 0));
  }

  /**
   * Get ranking explanation for a result
   */
  public explainRanking(result: SearchResult, options: RankingOptions): string {
    const parts = [
      `Relevance: ${(result.relevanceScore * 100).toFixed(0)}% (weight: ${options.relevanceWeight})`,
      `Freshness: ${(result.freshnessScore * 100).toFixed(0)}% (weight: ${options.freshnessWeight})`,
      `Authority: ${result.metadata.authorityLevel} (weight: ${options.authorityWeight})`,
      `Document Type: ${result.metadata.documentType}`,
      `Effective Date: ${new Date(result.metadata.effectiveDate).toLocaleDateString()}`
    ];

    return parts.join(' | ');
  }

  /**
   * Analyze ranking distribution
   */
  public analyzeRankingDistribution(results: SearchResult[]): any {
    if (results.length === 0) return null;

    const scores = results.map(r => r.compositeScore || r.score);
    const sortedScores = [...scores].sort((a, b) => b - a);

    return {
      count: results.length,
      mean: scores.reduce((a, b) => a + b, 0) / scores.length,
      median: sortedScores[Math.floor(sortedScores.length / 2)],
      min: Math.min(...scores),
      max: Math.max(...scores),
      range: Math.max(...scores) - Math.min(...scores),
      documentTypes: this.groupBy(results, 'documentType'),
      authorities: this.groupBy(results, 'authorityLevel')
    };
  }

  private groupBy(results: SearchResult[], field: string): Record<string, number> {
    return results.reduce((acc, result) => {
      const key = result.metadata[field] || 'Unknown';
      acc[key] = (acc[key] || 0) + 1;
      return acc;
    }, {} as Record<string, number>);
  }
}

export default RankingService;