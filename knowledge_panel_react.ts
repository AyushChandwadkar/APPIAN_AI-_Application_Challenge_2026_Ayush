/**
 * Knowledge Panel - Main React Component
 * Appian Custom Component for Intelligent Knowledge Retrieval
 */

import React, { useState, useEffect, useCallback } from 'react';
import { 
  Search, 
  FileText, 
  AlertCircle, 
  CheckCircle, 
  TrendingUp,
  Calendar,
  Shield,
  ExternalLink
} from 'lucide-react';
import { apiClient } from '../services/apiClient';
import CitationCard from './CitationCard';
import ConfidenceIndicator from './ConfidenceIndicator';
import LoadingSpinner from './LoadingSpinner';
import AlertNotification from './AlertNotification';
import styles from '../styles/KnowledgePanel.module.css';

interface CaseContext {
  claimType: string;
  state?: string;
  amount?: number;
  customerType?: string;
  dateOfLoss?: string;
  policyType?: string;
  metadata?: Record<string, any>;
}

interface KnowledgeResult {
  documentId: string;
  title: string;
  text: string;
  summary: string;
  citations: Array<{
    text: string;
    source: string;
    pageNumber?: number;
    section?: string;
  }>;
  confidenceScore: number;
  relevanceScore: number;
  freshnessScore: number;
  authorityLevel: string;
  documentType: string;
  effectiveDate: string;
  source: string;
  metadata: Record<string, any>;
}

interface KnowledgePanelProps {
  caseContext: CaseContext;
  autoSearch?: boolean;
  maxResults?: number;
  minConfidence?: number;
  onResultSelect?: (result: KnowledgeResult) => void;
  appianContext?: any;
}

const KnowledgePanel: React.FC<KnowledgePanelProps> = ({
  caseContext,
  autoSearch = true,
  maxResults = 5,
  minConfidence = 0.7,
  onResultSelect,
  appianContext
}) => {
  const [results, setResults] = useState<KnowledgeResult[]>([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedResult, setSelectedResult] = useState<KnowledgeResult | null>(null);
  const [metrics, setMetrics] = useState<any>(null);
  const [disclaimer, setDisclaimer] = useState<string>('');

  // Auto-search on mount if enabled
  useEffect(() => {
    if (autoSearch && caseContext) {
      handleSearch();
    }
  }, [caseContext, autoSearch]);

  /**
   * Main search handler
   */
  const handleSearch = useCallback(async () => {
    setLoading(true);
    setError(null);

    try {
      const response = await apiClient.post('/knowledge/retrieve', {
        caseContext,
        query: searchQuery || undefined,
        limit: maxResults,
        filters: {
          minConfidence
        }
      });

      if (response.data.success) {
        setResults(response.data.data.results);
        setMetrics(response.data.data.metrics);
        setDisclaimer(response.data.data.disclaimer);
      } else {
        throw new Error(response.data.error || 'Search failed');
      }
    } catch (err: any) {
      setError(err.response?.data?.error || err.message || 'Failed to retrieve knowledge');
      setResults([]);
    } finally {
      setLoading(false);
    }
  }, [caseContext, searchQuery, maxResults, minConfidence]);

  /**
   * Handle result selection
   */
  const handleResultClick = (result: KnowledgeResult) => {
    setSelectedResult(result);
    if (onResultSelect) {
      onResultSelect(result);
    }
  };

  /**
   * Handle feedback submission
   */
  const handleFeedback = async (resultId: string, helpful: boolean) => {
    try {
      await apiClient.post('/knowledge/feedback', {
        documentId: resultId,
        helpful,
        caseContext
      });
      
      // Show success message
      setError(null);
    } catch (err) {
      console.error('Failed to submit feedback', err);
    }
  };

  /**
   * Render empty state
   */
  const renderEmptyState = () => (
    <div className={styles.emptyState}>
      <FileText size={48} className={styles.emptyIcon} />
      <h3>No Results Found</h3>
      <p>Try refining your search or adjust the case context.</p>
    </div>
  );

  /**
   * Render case context summary
   */
  const renderCaseContext = () => (
    <div className={styles.caseContext}>
      <h4>Case Context</h4>
      <div className={styles.contextGrid}>
        <div className={styles.contextItem}>
          <span className={styles.label}>Claim Type:</span>
          <span className={styles.value}>{caseContext.claimType}</span>
        </div>
        {caseContext.state && (
          <div className={styles.contextItem}>
            <span className={styles.label}>State:</span>
            <span className={styles.value}>{caseContext.state}</span>
          </div>
        )}
        {caseContext.customerType && (
          <div className={styles.contextItem}>
            <span className={styles.label}>Customer Type:</span>
            <span className={styles.value}>{caseContext.customerType}</span>
          </div>
        )}
        {caseContext.amount && (
          <div className={styles.contextItem}>
            <span className={styles.label}>Claim Amount:</span>
            <span className={styles.value}>${caseContext.amount.toLocaleString()}</span>
          </div>
        )}
      </div>
    </div>
  );

  /**
   * Render metrics
   */
  const renderMetrics = () => {
    if (!metrics) return null;

    return (
      <div className={styles.metrics}>
        <div className={styles.metricCard}>
          <TrendingUp size={20} />
          <div>
            <div className={styles.metricValue}>{metrics.returnedResults}</div>
            <div className={styles.metricLabel}>Results</div>
          </div>
        </div>
        <div className={styles.metricCard}>
          <CheckCircle size={20} />
          <div>
            <div className={styles.metricValue}>
              {(metrics.averageConfidence * 100).toFixed(0)}%
            </div>
            <div className={styles.metricLabel}>Avg Confidence</div>
          </div>
        </div>
        <div className={styles.metricCard}>
          <Calendar size={20} />
          <div>
            <div className={styles.metricValue}>{metrics.searchTime}ms</div>
            <div className={styles.metricLabel}>Response Time</div>
          </div>
        </div>
      </div>
    );
  };

  return (
    <div className={styles.knowledgePanel}>
      {/* Header */}
      <div className={styles.header}>
        <div className={styles.headerContent}>
          <Shield className={styles.headerIcon} size={24} />
          <h2>Intelligent Knowledge Retrieval</h2>
        </div>
        <div className={styles.headerBadge}>
          AI-Powered
        </div>
      </div>

      {/* Search Bar */}
      <div className={styles.searchSection}>
        <div className={styles.searchBar}>
          <Search className={styles.searchIcon} size={20} />
          <input
            type="text"
            placeholder="Refine your search (optional)..."
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            onKeyPress={(e) => e.key === 'Enter' && handleSearch()}
            className={styles.searchInput}
          />
          <button 
            onClick={handleSearch} 
            disabled={loading}
            className={styles.searchButton}
          >
            {loading ? 'Searching...' : 'Search'}
          </button>
        </div>
      </div>

      {/* Case Context Summary */}
      {renderCaseContext()}

      {/* Metrics */}
      {renderMetrics()}

      {/* Error Alert */}
      {error && (
        <AlertNotification
          type="error"
          message={error}
          onClose={() => setError(null)}
        />
      )}

      {/* Loading State */}
      {loading && (
        <div className={styles.loadingContainer}>
          <LoadingSpinner />
          <p>Searching knowledge base...</p>
        </div>
      )}

      {/* Results */}
      {!loading && results.length > 0 && (
        <div className={styles.resultsSection}>
          <h3 className={styles.resultsHeader}>
            {results.length} Relevant Document{results.length !== 1 ? 's' : ''} Found
          </h3>
          
          <div className={styles.resultsList}>
            {results.map((result, index) => (
              <div 
                key={result.documentId}
                className={`${styles.resultCard} ${selectedResult?.documentId === result.documentId ? styles.selected : ''}`}
                onClick={() => handleResultClick(result)}
              >
                {/* Result Header */}
                <div className={styles.resultHeader}>
                  <div className={styles.resultTitle}>
                    <FileText size={18} />
                    <h4>{result.title}</h4>
                  </div>
                  <ConfidenceIndicator score={result.confidenceScore} />
                </div>

                {/* Result Metadata */}
                <div className={styles.resultMeta}>
                  <span className={styles.badge}>{result.documentType}</span>
                  <span className={styles.badge}>{result.authorityLevel}</span>
                  <span className={styles.metaText}>
                    Effective: {new Date(result.effectiveDate).toLocaleDateString()}
                  </span>
                </div>

                {/* Summary */}
                <div className={styles.resultSummary}>
                  <p>{result.summary}</p>
                </div>

                {/* Citations */}
                {result.citations.length > 0 && (
                  <div className={styles.citations}>
                    <h5>Citations:</h5>
                    {result.citations.slice(0, 2).map((citation, idx) => (
                      <CitationCard 
                        key={idx}
                        citation={citation}
                        compact
                      />
                    ))}
                    {result.citations.length > 2 && (
                      <button className={styles.showMoreCitations}>
                        +{result.citations.length - 2} more citations
                      </button>
                    )}
                  </div>
                )}

                {/* Actions */}
                <div className={styles.resultActions}>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleFeedback(result.documentId, true);
                    }}
                    className={styles.actionButton}
                  >
                    <CheckCircle size={16} />
                    Helpful
                  </button>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      // Open document viewer
                    }}
                    className={styles.actionButton}
                  >
                    <ExternalLink size={16} />
                    View Full Document
                  </button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Empty State */}
      {!loading && results.length === 0 && !error && renderEmptyState()}

      {/* Disclaimer */}
      {disclaimer && (
        <div className={styles.disclaimer}>
          <AlertCircle size={16} />
          <p>{disclaimer}</p>
        </div>
      )}
    </div>
  );
};

export default KnowledgePanel;