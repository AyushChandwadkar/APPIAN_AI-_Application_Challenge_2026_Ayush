/**
 * Citation Service
 * Extracts, formats, and verifies citations from documents
 */

import { LLMService } from './llmService';
import { logger } from '../utils/logger';

interface Citation {
  text: string;
  source: string;
  documentId: string;
  pageNumber?: number;
  section?: string;
  subsection?: string;
  paragraph?: number;
  confidence: number;
  format: string;
  verified: boolean;
  extractedAt: Date;
}

interface CitationExtractionOptions {
  format?: 'APA' | 'MLA' | 'Chicago' | 'Legal';
  maxCitations?: number;
  minConfidence?: number;
  verifyAccuracy?: boolean;
}

export class CitationService {
  private llmService: LLMService;

  constructor() {
    this.llmService = new LLMService();
  }

  /**
   * Extract citations from document text
   */
  public async extractCitations(
    documentId: string,
    text: string,
    options: CitationExtractionOptions = {}
  ): Promise<Citation[]> {
    try {
      const {
        format = 'Legal',
        maxCitations = 10,
        minConfidence = 0.7,
        verifyAccuracy = true
      } = options;

      logger.info('Extracting citations', { documentId, textLength: text.length });

      // Split text into meaningful chunks
      const chunks = this.splitIntoChunks(text, 2000);
      const allCitations: Citation[] = [];

      for (const chunk of chunks.slice(0, 5)) { // Limit to first 5 chunks
        const extractedCitations = await this.extractCitationsFromChunk(
          chunk,
          documentId,
          format
        );
        allCitations.push(...extractedCitations);
      }

      // Filter by confidence
      let filteredCitations = allCitations.filter(c => c.confidence >= minConfidence);

      // Verify accuracy if requested
      if (verifyAccuracy) {
        filteredCitations = await this.verifyCitations(filteredCitations, text);
      }

      // Deduplicate and limit
      const uniqueCitations = this.deduplicateCitations(filteredCitations);
      const finalCitations = uniqueCitations.slice(0, maxCitations);

      logger.info(`Extracted ${finalCitations.length} citations`, { documentId });

      return finalCitations;

    } catch (error) {
      logger.error('Citation extraction error', error);
      return [];
    }
  }

  /**
   * Format citation in specific style
   */
  public formatCitation(
    citation: Citation,
    format: 'APA' | 'MLA' | 'Chicago' | 'Legal' = 'Legal'
  ): string {
    switch (format) {
      case 'APA':
        return this.formatAPA(citation);
      case 'MLA':
        return this.formatMLA(citation);
      case 'Chicago':
        return this.formatChicago(citation);
      case 'Legal':
      default:
        return this.formatLegal(citation);
    }
  }

  /**
   * Verify citation accuracy against source text
   */
  public async verifyCitation(
    citation: Citation,
    sourceText: string
  ): Promise<{ isAccurate: boolean; confidence: number; issues: string[] }> {
    try {
      return await this.llmService.verifyCitation(citation.text, sourceText);
    } catch (error) {
      logger.error('Citation verification error', error);
      return {
        isAccurate: false,
        confidence: 0,
        issues: ['Verification failed']
      };
    }
  }

  /**
   * Generate citation from document metadata
   */
  public async generateCitationFromMetadata(
    metadata: any,
    format: string = 'Legal'
  ): Promise<string> {
    try {
      return await this.llmService.generateCitation(metadata, { format });
    } catch (error) {
      logger.error('Citation generation from metadata error', error);
      return this.generateFallbackCitation(metadata);
    }
  }

  /**
   * Extract inline references from text
   */
  public extractInlineReferences(text: string): string[] {
    const patterns = [
      /\b\d+\s+U\.S\.C\.\s+§\s*\d+/gi,                    // US Code
      /\b\d+\s+C\.F\.R\.\s+§\s*\d+/gi,                    // Code of Federal Regulations
      /Section\s+\d+(\.\d+)*/gi,                          // Section references
      /\(\d{4}\)/g,                                        // Years in parentheses
      /[A-Z][a-z]+\s+v\.\s+[A-Z][a-z]+/g,                // Case citations
      /\b(?:Id\.|Ibid\.|See|supra|infra)\b/gi,           // Legal citations
    ];

    const references = new Set<string>();
    patterns.forEach(pattern => {
      const matches = text.match(pattern) || [];
      matches.forEach(match => references.add(match.trim()));
    });

    return Array.from(references);
  }

  /**
   * Build citation graph showing relationships
   */
  public buildCitationGraph(citations: Citation[]): any {
    const graph: any = {
      nodes: [],
      edges: []
    };

    citations.forEach((citation, index) => {
      graph.nodes.push({
        id: `citation-${index}`,
        label: citation.source,
        type: 'citation',
        confidence: citation.confidence
      });

      // Find relationships
      citations.forEach((otherCitation, otherIndex) => {
        if (index !== otherIndex && this.areCitationsRelated(citation, otherCitation)) {
          graph.edges.push({
            from: `citation-${index}`,
            to: `citation-${otherIndex}`,
            type: 'related'
          });
        }
      });
    });

    return graph;
  }

  /**
   * Private helper methods
   */

  private async extractCitationsFromChunk(
    chunk: string,
    documentId: string,
    format: string
  ): Promise<Citation[]> {
    const citations: Citation[] = [];

    // Extract section headers
    const sectionMatches = chunk.match(/^#{1,3}\s+(.+)$/gm) || [];
    
    // Extract numbered sections
    const numberedSections = chunk.match(/^\d+\.(\d+\.)*\s+(.+)$/gm) || [];

    // Extract inline references
    const inlineRefs = this.extractInlineReferences(chunk);

    // Combine all potential citations
    const potentialCitations = [
      ...sectionMatches,
      ...numberedSections,
      ...inlineRefs
    ];

    for (const citationText of potentialCitations.slice(0, 20)) {
      if (citationText.trim().length < 10) continue;

      citations.push({
        text: citationText.trim(),
        source: 'Document',
        documentId,
        confidence: this.calculateCitationConfidence(citationText),
        format,
        verified: false,
        extractedAt: new Date()
      });
    }

    return citations;
  }

  private async verifyCitations(
    citations: Citation[],
    sourceText: string
  ): Promise<Citation[]> {
    const verifiedCitations: Citation[] = [];

    for (const citation of citations.slice(0, 10)) { // Limit verification to 10
      const verification = await this.verifyCitation(citation, sourceText);
      
      if (verification.isAccurate && verification.confidence >= 0.7) {
        verifiedCitations.push({
          ...citation,
          verified: true,
          confidence: verification.confidence
        });
      }
    }

    return verifiedCitations;
  }

  private deduplicateCitations(citations: Citation[]): Citation[] {
    const seen = new Set<string>();
    const unique: Citation[] = [];

    for (const citation of citations) {
      const key = this.generateCitationKey(citation);
      if (!seen.has(key)) {
        seen.add(key);
        unique.push(citation);
      }
    }

    return unique;
  }

  private generateCitationKey(citation: Citation): string {
    return `${citation.documentId}:${citation.text.substring(0, 50)}`;
  }

  private calculateCitationConfidence(text: string): number {
    let confidence = 0.5;

    // Boost confidence for specific patterns
    if (/\d+\s+(U\.S\.C\.|C\.F\.R\.)/.test(text)) confidence += 0.3;
    if (/Section\s+\d+/.test(text)) confidence += 0.2;
    if (/\(\d{4}\)/.test(text)) confidence += 0.1;
    if (text.length > 30 && text.length < 200) confidence += 0.1;

    return Math.min(confidence, 1.0);
  }

  private areCitationsRelated(c1: Citation, c2: Citation): boolean {
    // Check if citations reference same section
    if (c1.section && c2.section && c1.section === c2.section) return true;
    
    // Check text similarity
    const similarity = this.calculateTextSimilarity(c1.text, c2.text);
    return similarity > 0.7;
  }

  private calculateTextSimilarity(text1: string, text2: string): number {
    const words1 = new Set(text1.toLowerCase().split(/\s+/));
    const words2 = new Set(text2.toLowerCase().split(/\s+/));
    
    const intersection = new Set([...words1].filter(w => words2.has(w)));
    const union = new Set([...words1, ...words2]);
    
    return intersection.size / union.size;
  }

  private splitIntoChunks(text: string, chunkSize: number): string[] {
    const chunks: string[] = [];
    for (let i = 0; i < text.length; i += chunkSize) {
      chunks.push(text.substring(i, i + chunkSize));
    }
    return chunks;
  }

  // Formatting methods
  private formatLegal(citation: Citation): string {
    const parts = [
      citation.source,
      citation.section ? `§ ${citation.section}` : '',
      citation.pageNumber ? `at ${citation.pageNumber}` : '',
      citation.paragraph ? `¶ ${citation.paragraph}` : ''
    ].filter(Boolean);

    return parts.join(', ');
  }

  private formatAPA(citation: Citation): string {
    return `${citation.source}${citation.pageNumber ? `, p. ${citation.pageNumber}` : ''}`;
  }

  private formatMLA(citation: Citation): string {
    return `${citation.source}${citation.pageNumber ? ` ${citation.pageNumber}` : ''}`;
  }

  private formatChicago(citation: Citation): string {
    return `${citation.source}${citation.pageNumber ? `, ${citation.pageNumber}` : ''}`;
  }

  private generateFallbackCitation(metadata: any): string {
    return `${metadata.source || 'Unknown Source'}${metadata.pageNumber ? `, p. ${metadata.pageNumber}` : ''}`;
  }
}

export default CitationService;