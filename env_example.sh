# =================================
# SERVER CONFIGURATION
# =================================
NODE_ENV=development
PORT=3000
API_VERSION=1.0.0

# =================================
# CORS CONFIGURATION
# =================================
CORS_ORIGINS=http://localhost:3000,http://localhost:5173

# =================================
# DATABASE - PostgreSQL
# =================================
DB_HOST=localhost
DB_PORT=5432
DB_NAME=knowledge_retrieval
DB_USER=postgres
DB_PASSWORD=your_secure_password_here
DB_SSL_ENABLED=false
DB_POOL_MIN=2
DB_POOL_MAX=10

# =================================
# CACHE - Redis
# =================================
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=your_redis_password_here
REDIS_TTL=3600

# =================================
# VECTOR DATABASE - Pinecone
# =================================
PINECONE_API_KEY=your_pinecone_api_key_here
PINECONE_ENVIRONMENT=us-west1-gcp
PINECONE_INDEX_NAME=knowledge-retrieval
PINECONE_NAMESPACE=

# =================================
# AI/ML - OpenAI
# =================================
OPENAI_API_KEY=your_openai_api_key_here
OPENAI_MODEL=gpt-4-turbo-preview
OPENAI_EMBEDDING_MODEL=text-embedding-3-large
OPENAI_MAX_TOKENS=2000
OPENAI_TEMPERATURE=0.3

# =================================
# AUTHENTICATION
# =================================
JWT_SECRET=your_very_long_and_secure_jwt_secret_minimum_32_characters
JWT_EXPIRES_IN=24h

# OAuth (Optional)
OAUTH_CLIENT_ID=
OAUTH_CLIENT_SECRET=
OAUTH_REDIRECT_URI=

# =================================
# RATE LIMITING
# =================================
RATE_LIMIT_WINDOW_MS=60000
RATE_LIMIT_MAX_REQUESTS=100

# =================================
# DOCUMENT INGESTION
# =================================
MAX_FILE_SIZE=52428800
ALLOWED_FILE_TYPES=pdf,docx,txt,md,html,csv
UPLOAD_PATH=./uploads

# =================================
# SEARCH CONFIGURATION
# =================================
MAX_SEARCH_RESULTS=20
MIN_CONFIDENCE_SCORE=0.7
SEMANTIC_SEARCH_THRESHOLD=0.8

# =================================
# LOGGING
# =================================
LOG_LEVEL=info
LOG_FORMAT=json

# =================================
# AUDIT & COMPLIANCE
# =================================
AUDIT_LOG_RETENTION_DAYS=2555
COMPLIANCE_MODE=true

# =================================
# PERFORMANCE
# =================================
CACHE_ENABLED=true
CACHE_TTL=3600
WORKER_THREADS=4

# =================================
# MONITORING (Optional)
# =================================
SENTRY_DSN=
DATADOG_API_KEY=

# =================================
# APPIAN INTEGRATION
# =================================
APPIAN_API_URL=https://your-appian-instance.com/api
APPIAN_API_KEY=
APPIAN_WEBHOOK_SECRET=

# =================================
# EMAIL NOTIFICATIONS (Optional)
# =================================
SMTP_HOST=
SMTP_PORT=587
SMTP_USER=
SMTP_PASSWORD=
SMTP_FROM=noreply@yourcompany.com

# =================================
# FEATURE FLAGS
# =================================
ENABLE_WEB_SEARCH=false
ENABLE_AUTO_CLASSIFICATION=true
ENABLE_CITATION_VERIFICATION=true
ENABLE_FEEDBACK_LEARNING=true

# =================================
# DEVELOPMENT ONLY
# =================================
DEBUG_MODE=false
MOCK_EXTERNAL_SERVICES=false