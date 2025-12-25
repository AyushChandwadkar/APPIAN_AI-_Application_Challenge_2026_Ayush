-- ================================================
-- Knowledge Retrieval System - Initial Schema
-- PostgreSQL 15 with pgvector extension
-- ================================================

-- Enable pgvector extension for vector similarity search
CREATE EXTENSION IF NOT EXISTS vector;
CREATE EXTENSION IF NOT EXISTS "uuid-ossp";

-- ================================================
-- DOCUMENTS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS documents (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    title VARCHAR(500) NOT NULL,
    document_type VARCHAR(50) NOT NULL,
    source VARCHAR(255) NOT NULL,
    authority_level VARCHAR(50) NOT NULL DEFAULT 'STANDARD',
    effective_date TIMESTAMP NOT NULL,
    expiration_date TIMESTAMP,
    file_path TEXT,
    file_size BIGINT,
    mime_type VARCHAR(100),
    page_count INTEGER,
    version INTEGER DEFAULT 1,
    status VARCHAR(20) DEFAULT 'ACTIVE',
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
    created_by VARCHAR(100),
    updated_by VARCHAR(100)
);

CREATE INDEX idx_documents_type ON documents(document_type);
CREATE INDEX idx_documents_authority ON documents(authority_level);
CREATE INDEX idx_documents_effective_date ON documents(effective_date);
CREATE INDEX idx_documents_status ON documents(status);
CREATE INDEX idx_documents_metadata ON documents USING GIN(metadata);

-- ================================================
-- DOCUMENT CHUNKS TABLE
-- Stores text chunks with embeddings for vector search
-- ================================================
CREATE TABLE IF NOT EXISTS document_chunks (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    chunk_index INTEGER NOT NULL,
    text TEXT NOT NULL,
    embedding vector(1536), -- OpenAI ada-002 dimension
    token_count INTEGER,
    page_number INTEGER,
    section VARCHAR(255),
    subsection VARCHAR(255),
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_chunks_document ON document_chunks(document_id);
CREATE INDEX idx_chunks_page ON document_chunks(page_number);
CREATE INDEX idx_chunks_embedding ON document_chunks USING ivfflat (embedding vector_cosine_ops);

-- ================================================
-- CITATIONS TABLE
-- ================================================
CREATE TABLE IF NOT EXISTS citations (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID NOT NULL REFERENCES documents(id) ON DELETE CASCADE,
    citation_text TEXT NOT NULL,
    formatted_citation TEXT NOT NULL,
    citation_format VARCHAR(20) DEFAULT 'Legal',
    page_number INTEGER,
    section VARCHAR(255),
    paragraph INTEGER,
    confidence_score DECIMAL(3,2) DEFAULT 0.80,
    verified BOOLEAN DEFAULT FALSE,
    verification_date TIMESTAMP,
    metadata JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_citations_document ON citations(document_id);
CREATE INDEX idx_citations_verified ON citations(verified);
CREATE INDEX idx_citations_confidence ON citations(confidence_score);

-- ================================================
-- AUDIT LOGS TABLE
-- Comprehensive audit trail for compliance
-- ================================================
CREATE TABLE IF NOT EXISTS audit_logs (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100),
    action VARCHAR(100) NOT NULL,
    resource_type VARCHAR(50) NOT NULL,
    resource_id VARCHAR(255),
    ip_address INET,
    user_agent TEXT,
    request_payload JSONB,
    response_status INTEGER,
    details JSONB DEFAULT '{}',
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_audit_user ON audit_logs(user_id);
CREATE INDEX idx_audit_action ON audit_logs(action);
CREATE INDEX idx_audit_resource ON audit_logs(resource_type, resource_id);
CREATE INDEX idx_audit_timestamp ON audit_logs(timestamp);

-- ================================================
-- SEARCH HISTORY TABLE
-- Track search queries for analytics
-- ================================================
CREATE TABLE IF NOT EXISTS search_history (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100),
    query_text TEXT NOT NULL,
    case_context JSONB NOT NULL,
    results_count INTEGER,
    avg_confidence DECIMAL(3,2),
    response_time_ms INTEGER,
    filters JSONB,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_search_user ON search_history(user_id);
CREATE INDEX idx_search_timestamp ON search_history(timestamp);
CREATE INDEX idx_search_context ON search_history USING GIN(case_context);

-- ================================================
-- USER FEEDBACK TABLE
-- Collect feedback on search results
-- ================================================
CREATE TABLE IF NOT EXISTS user_feedback (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    user_id VARCHAR(100),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    search_history_id UUID REFERENCES search_history(id) ON DELETE CASCADE,
    helpful BOOLEAN NOT NULL,
    relevance_score INTEGER CHECK (relevance_score BETWEEN 1 AND 5),
    comments TEXT,
    timestamp TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_feedback_document ON user_feedback(document_id);
CREATE INDEX idx_feedback_helpful ON user_feedback(helpful);
CREATE INDEX idx_feedback_timestamp ON user_feedback(timestamp);

-- ================================================
-- DOCUMENT TAGS TABLE
-- Many-to-many relationship for document categorization
-- ================================================
CREATE TABLE IF NOT EXISTS tags (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    name VARCHAR(100) UNIQUE NOT NULL,
    category VARCHAR(50),
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE TABLE IF NOT EXISTS document_tags (
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    tag_id UUID REFERENCES tags(id) ON DELETE CASCADE,
    PRIMARY KEY (document_id, tag_id)
);

CREATE INDEX idx_document_tags_document ON document_tags(document_id);
CREATE INDEX idx_document_tags_tag ON document_tags(tag_id);

-- ================================================
-- CACHE ENTRIES TABLE
-- Store frequently accessed data
-- ================================================
CREATE TABLE IF NOT EXISTS cache_entries (
    key VARCHAR(255) PRIMARY KEY,
    value JSONB NOT NULL,
    expires_at TIMESTAMP NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_cache_expires ON cache_entries(expires_at);

-- ================================================
-- PROCESSING QUEUE TABLE
-- Track document processing jobs
-- ================================================
CREATE TABLE IF NOT EXISTS processing_queue (
    id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
    document_id UUID REFERENCES documents(id) ON DELETE CASCADE,
    job_type VARCHAR(50) NOT NULL,
    status VARCHAR(20) DEFAULT 'PENDING',
    priority INTEGER DEFAULT 5,
    attempts INTEGER DEFAULT 0,
    max_attempts INTEGER DEFAULT 3,
    error_message TEXT,
    started_at TIMESTAMP,
    completed_at TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

CREATE INDEX idx_queue_status ON processing_queue(status);
CREATE INDEX idx_queue_priority ON processing_queue(priority DESC);
CREATE INDEX idx_queue_document ON processing_queue(document_id);

-- ================================================
-- FUNCTIONS AND TRIGGERS
-- ================================================

-- Update timestamp trigger function
CREATE OR REPLACE FUNCTION update_updated_at_column()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = CURRENT_TIMESTAMP;
    RETURN NEW;
END;
$$ language 'plpgsql';

-- Apply updated_at trigger to documents table
CREATE TRIGGER update_documents_updated_at 
    BEFORE UPDATE ON documents 
    FOR EACH ROW 
    EXECUTE FUNCTION update_updated_at_column();

-- Function to clean expired cache entries
CREATE OR REPLACE FUNCTION clean_expired_cache()
RETURNS INTEGER AS $$
DECLARE
    deleted_count INTEGER;
BEGIN
    DELETE FROM cache_entries WHERE expires_at < CURRENT_TIMESTAMP;
    GET DIAGNOSTICS deleted_count = ROW_COUNT;
    RETURN deleted_count;
END;
$$ LANGUAGE plpgsql;

-- Vector similarity search function
CREATE OR REPLACE FUNCTION search_similar_chunks(
    query_embedding vector(1536),
    match_threshold FLOAT DEFAULT 0.8,
    match_count INT DEFAULT 10
)
RETURNS TABLE (
    chunk_id UUID,
    document_id UUID,
    text TEXT,
    similarity FLOAT,
    metadata JSONB
) AS $$
BEGIN
    RETURN QUERY
    SELECT 
        dc.id,
        dc.document_id,
        dc.text,
        1 - (dc.embedding <=> query_embedding) AS similarity,
        dc.metadata
    FROM document_chunks dc
    WHERE 1 - (dc.embedding <=> query_embedding) > match_threshold
    ORDER BY dc.embedding <=> query_embedding
    LIMIT match_count;
END;
$$ LANGUAGE plpgsql;

-- ================================================
-- VIEWS FOR ANALYTICS
-- ================================================

-- Document statistics view
CREATE OR REPLACE VIEW v_document_stats AS
SELECT 
    document_type,
    authority_level,
    COUNT(*) as count,
    AVG(page_count) as avg_pages,
    MIN(effective_date) as oldest_date,
    MAX(effective_date) as newest_date
FROM documents
WHERE status = 'ACTIVE'
GROUP BY document_type, authority_level;

-- Search analytics view
CREATE OR REPLACE VIEW v_search_analytics AS
SELECT 
    DATE(timestamp) as search_date,
    COUNT(*) as total_searches,
    AVG(results_count) as avg_results,
    AVG(avg_confidence) as avg_confidence,
    AVG(response_time_ms) as avg_response_time
FROM search_history
GROUP BY DATE(timestamp)
ORDER BY search_date DESC;

-- User feedback summary view
CREATE OR REPLACE VIEW v_feedback_summary AS
SELECT 
    d.document_type,
    d.authority_level,
    COUNT(*) as feedback_count,
    SUM(CASE WHEN uf.helpful THEN 1 ELSE 0 END) as helpful_count,
    ROUND(
        100.0 * SUM(CASE WHEN uf.helpful THEN 1 ELSE 0 END) / COUNT(*), 
        2
    ) as helpful_percentage,
    AVG(uf.relevance_score) as avg_relevance
FROM user_feedback uf
JOIN documents d ON uf.document_id = d.id
GROUP BY d.document_type, d.authority_level;

-- ================================================
-- SAMPLE DATA FOR TESTING
-- ================================================

-- Insert sample document types
INSERT INTO tags (name, category) VALUES
    ('Flood Insurance', 'Claim Type'),
    ('Property Damage', 'Claim Type'),
    ('Federal Regulation', 'Authority'),
    ('State Law', 'Authority'),
    ('Company Policy', 'Authority'),
    ('Florida', 'State'),
    ('California', 'State'),
    ('Texas', 'State')
ON CONFLICT (name) DO NOTHING;

-- ================================================
-- GRANT PERMISSIONS
-- ================================================

-- Grant permissions to application user
-- GRANT ALL PRIVILEGES ON ALL TABLES IN SCHEMA public TO knowledge_app_user;
-- GRANT ALL PRIVILEGES ON ALL SEQUENCES IN SCHEMA public TO knowledge_app_user;
-- GRANT EXECUTE ON ALL FUNCTIONS IN SCHEMA public TO knowledge_app_user;

COMMIT;