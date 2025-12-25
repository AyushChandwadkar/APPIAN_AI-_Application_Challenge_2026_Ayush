/**
 * LLM Service - OpenAI GPT-4 Integration
 * Handles summarization, citation generation, and verification
 */

import OpenAI from 'openai';
import { config } from '../config/env';
import { logger } from '../utils/logger';

interface SummaryOptions {
  maxLength?: number;
  style?: 'concise' | 'detailed' | 'executive';
  includeKeyPoints?: boolean;
}

interface CitationGenerationOptions {
  format?: 'APA' | 'MLA' | 'Chicago' | 'Legal';
  includePageNumbers?: boolean;
}

export class LLMService {
  private openai: OpenAI;
  private model: string;
  private maxTokens: number;
  private temperature: number;

  constructor() {
    this.openai = new OpenAI({
      apiKey: config.openaiApiKey,
    });
    this.model = config.openaiModel;
    this.maxTokens = config.openaiMaxTokens;
    this.temperature = config.openaiTemperature;
  }

  /**
   * Generate context-aware summary of document text
   */
  public async generateSummary(
    text: string,
    caseContext: any,
    options: SummaryOptions = {}
  ): Promise<string> {
    try {
      const {
        maxLength = 200,
        style = 'concise',
        includeKeyPoints = true
      } = options;

      const systemPrompt = this.buildSummarySystemPrompt(style, caseContext);
      const userPrompt = this.buildSummaryUserPrompt(text, maxLength, includeKeyPoints);

      logger.info('Generating summary with LLM', { 
        textLength: text.length, 
        style,
        caseContext: caseContext.claimType 
      });

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: Math.min(maxLength * 2, this.maxTokens),
        temperature: this.temperature,
      });

      const summary = response.choices[0]?.message?.content?.trim();

      if (!summary) {
        throw new Error('No summary generated');
      }

      logger.info('Summary generated successfully', { 
        summaryLength: summary.length,
        tokensUsed: response.usage?.total_tokens 
      });

      return summary;

    } catch (error) {
      logger.error('LLM summary generation error', error);
      
      // Fallback: extract first N sentences
      return this.extractFirstSentences(text, 3);
    }
  }

  /**
   * Generate formatted citations from document metadata
   */
  public async generateCitation(
    documentMetadata: any,
    options: CitationGenerationOptions = {}
  ): Promise<string> {
    try {
      const { format = 'Legal', includePageNumbers = true } = options;

      const prompt = `Generate a ${format} citation for the following document:
      
Title: ${documentMetadata.title}
Author/Source: ${documentMetadata.source}
Date: ${documentMetadata.effectiveDate}
Document Type: ${documentMetadata.documentType}
${includePageNumbers && documentMetadata.pageNumber ? `Page: ${documentMetadata.pageNumber}` : ''}

Provide only the citation text, no additional commentary.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert in legal and academic citation formats. Generate accurate, properly formatted citations.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1, // Low temperature for consistency
      });

      return response.choices[0]?.message?.content?.trim() || '';

    } catch (error) {
      logger.error('Citation generation error', error);
      return this.generateFallbackCitation(documentMetadata);
    }
  }

  /**
   * Verify citation accuracy and detect hallucinations
   */
  public async verifyCitation(
    citation: string,
    sourceText: string
  ): Promise<{ isAccurate: boolean; confidence: number; issues: string[] }> {
    try {
      const prompt = `Verify if the following citation accurately represents the source text.

Citation: "${citation}"

Source Text: "${sourceText.substring(0, 2000)}"

Respond in JSON format:
{
  "isAccurate": boolean,
  "confidence": number (0-1),
  "issues": ["list of any inaccuracies or hallucinations"]
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: 'You are a citation verification expert. Detect any inaccuracies, misrepresentations, or hallucinations in citations.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 300,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        isAccurate: result.isAccurate ?? true,
        confidence: result.confidence ?? 0.8,
        issues: result.issues ?? []
      };

    } catch (error) {
      logger.error('Citation verification error', error);
      return {
        isAccurate: true,
        confidence: 0.5,
        issues: ['Verification failed']
      };
    }
  }

  /**
   * Generate contextual answer to specific question
   */
  public async answerQuestion(
    question: string,
    context: string,
    caseContext: any
  ): Promise<string> {
    try {
      const systemPrompt = `You are an expert insurance claims assistant. 
      
Current case context:
- Claim Type: ${caseContext.claimType}
- State: ${caseContext.state || 'N/A'}
- Customer Type: ${caseContext.customerType || 'N/A'}

Provide accurate, concise answers based solely on the provided context. 
If the context doesn't contain enough information, acknowledge the limitation.
Always cite specific sections when making claims.`;

      const userPrompt = `Question: ${question}

Context: ${context.substring(0, 4000)}

Provide a clear, direct answer with specific citations.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt }
        ],
        max_tokens: 500,
        temperature: 0.3,
      });

      return response.choices[0]?.message?.content?.trim() || 'Unable to generate answer.';

    } catch (error) {
      logger.error('Question answering error', error);
      throw error;
    }
  }

  /**
   * Extract key points from document
   */
  public async extractKeyPoints(
    text: string,
    maxPoints: number = 5
  ): Promise<string[]> {
    try {
      const prompt = `Extract the ${maxPoints} most important key points from the following text. 
      
Text: ${text.substring(0, 4000)}

Return as a JSON array of strings, each point being one clear sentence.`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { 
            role: 'system', 
            content: 'You are an expert at identifying key information in regulatory and policy documents.' 
          },
          { role: 'user', content: prompt }
        ],
        max_tokens: 400,
        temperature: 0.2,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{"points":[]}');
      return result.points || result.keyPoints || [];

    } catch (error) {
      logger.error('Key points extraction error', error);
      return [];
    }
  }

  /**
   * Classify document type automatically
   */
  public async classifyDocument(
    title: string,
    text: string
  ): Promise<{ type: string; confidence: number; tags: string[] }> {
    try {
      const prompt = `Classify the following document into one of these types:
- REGULATION (government regulations, legal requirements)
- POLICY (company policies, guidelines)
- PROCEDURE (standard operating procedures, workflows)
- CASE_STUDY (previous cases, examples)
- REFERENCE (reference materials, definitions)

Document Title: ${title}
Document Text (first 1000 chars): ${text.substring(0, 1000)}

Respond in JSON format:
{
  "type": "DOCUMENT_TYPE",
  "confidence": 0.95,
  "tags": ["tag1", "tag2", "tag3"]
}`;

      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages: [
          { role: 'system', content: 'You are a document classification expert.' },
          { role: 'user', content: prompt }
        ],
        max_tokens: 200,
        temperature: 0.1,
        response_format: { type: "json_object" }
      });

      const result = JSON.parse(response.choices[0]?.message?.content || '{}');
      
      return {
        type: result.type || 'REFERENCE',
        confidence: result.confidence || 0.7,
        tags: result.tags || []
      };

    } catch (error) {
      logger.error('Document classification error', error);
      return {
        type: 'REFERENCE',
        confidence: 0.5,
        tags: []
      };
    }
  }

  /**
   * Private helper methods
   */

  private buildSummarySystemPrompt(style: string, caseContext: any): string {
    const styleInstructions = {
      concise: 'Create a brief, focused summary highlighting only the most critical information.',
      detailed: 'Provide a comprehensive summary covering all major points and relevant details.',
      executive: 'Write an executive-level summary focusing on key decisions and implications.'
    };

    return `You are an expert insurance claims analyst summarizing policy documents.

Current case context:
- Claim Type: ${caseContext.claimType}
- State: ${caseContext.state || 'N/A'}

Style: ${styleInstructions[style]}

Focus on information most relevant to the current claim type.
Use clear, professional language.
Avoid speculation or adding information not in the source text.`;
  }

  private buildSummaryUserPrompt(
    text: string,
    maxLength: number,
    includeKeyPoints: boolean
  ): string {
    const truncatedText = text.substring(0, 6000); // Limit for token constraints

    return `Summarize the following document in approximately ${maxLength} words.
${includeKeyPoints ? 'Include 2-3 key points in bullet format at the end.' : ''}

Document:
${truncatedText}

Summary:`;
  }

  private extractFirstSentences(text: string, count: number): string {
    const sentences = text.match(/[^.!?]+[.!?]+/g) || [text];
    return sentences.slice(0, count).join(' ').trim();
  }

  private generateFallbackCitation(metadata: any): string {
    // Simple fallback citation format
    const parts = [
      metadata.source,
      metadata.title,
      metadata.effectiveDate ? `(${new Date(metadata.effectiveDate).getFullYear()})` : '',
      metadata.pageNumber ? `p. ${metadata.pageNumber}` : ''
    ].filter(Boolean);

    return parts.join(', ');
  }

  /**
   * Get token count estimate
   */
  public estimateTokens(text: string): number {
    // Rough estimate: ~4 characters per token
    return Math.ceil(text.length / 4);
  }

  /**
   * Check if text exceeds token limit
   */
  public exceedsTokenLimit(text: string, limit: number = 8000): boolean {
    return this.estimateTokens(text) > limit;
  }
}

export default LLMService;