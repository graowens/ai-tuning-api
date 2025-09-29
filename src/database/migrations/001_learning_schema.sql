-- src/database/migrations/001_learning_schema.sql

-- ECU families and variants
CREATE TABLE ecu_families (
                              id SERIAL PRIMARY KEY,
                              family_name VARCHAR(50) NOT NULL, -- 'EDC17CP20'
                              description TEXT,
                              created_at TIMESTAMP DEFAULT NOW()
);

-- Individual ECU variants within a family
CREATE TABLE ecu_variants (
                              id SERIAL PRIMARY KEY,
                              family_id INTEGER REFERENCES ecu_families(id),
                              variant_name VARCHAR(100) NOT NULL, -- '1037502339P850F521'
                              original_file_hash VARCHAR(64),
                              original_file_size INTEGER,
                              created_at TIMESTAMP DEFAULT NOW(),
                              UNIQUE(family_id, variant_name)
);

-- Types of modifications we can learn
CREATE TABLE modification_types (
                                    id SERIAL PRIMARY KEY,
                                    type_name VARCHAR(50) NOT NULL UNIQUE, -- 'dpf_off', 'egr_off', etc.
                                    display_name VARCHAR(100), -- 'DPF Delete'
                                    description TEXT,
                                    category VARCHAR(50), -- 'emissions', 'performance', 'comfort'
                                    created_at TIMESTAMP DEFAULT NOW()
);

-- Individual modification samples
CREATE TABLE modification_samples (
                                      id SERIAL PRIMARY KEY,
                                      variant_id INTEGER REFERENCES ecu_variants(id),
                                      modification_type_id INTEGER REFERENCES modification_types(id),
                                      modified_file_hash VARCHAR(64),
                                      differences_count INTEGER,
                                      confidence_score FLOAT DEFAULT 0.0,
                                      created_at TIMESTAMP DEFAULT NOW()
);

-- The actual byte-level changes discovered
CREATE TABLE modification_patterns (
                                       id SERIAL PRIMARY KEY,
                                       modification_type_id INTEGER REFERENCES modification_types(id),
                                       family_id INTEGER REFERENCES ecu_families(id),
                                       file_offset INTEGER NOT NULL,
                                       original_value BYTEA,
                                       modified_value BYTEA,
                                       pattern_size INTEGER, -- how many bytes this pattern spans
                                       frequency INTEGER DEFAULT 1, -- how often we've seen this pattern
                                       confidence FLOAT DEFAULT 0.0, -- statistical confidence (0-1)
                                       context_before BYTEA, -- 16 bytes before for context
                                       context_after BYTEA, -- 16 bytes after for context
                                       created_at TIMESTAMP DEFAULT NOW(),
                                       updated_at TIMESTAMP DEFAULT NOW()
);

-- Pattern clusters (similar patterns grouped together)
CREATE TABLE pattern_clusters (
                                  id SERIAL PRIMARY KEY,
                                  modification_type_id INTEGER REFERENCES modification_types(id),
                                  cluster_name VARCHAR(100),
                                  description TEXT,
                                  pattern_count INTEGER DEFAULT 0,
                                  avg_confidence FLOAT DEFAULT 0.0,
                                  created_at TIMESTAMP DEFAULT NOW()
);

-- Link patterns to clusters
CREATE TABLE pattern_cluster_members (
                                         pattern_id INTEGER REFERENCES modification_patterns(id),
                                         cluster_id INTEGER REFERENCES pattern_clusters(id),
                                         PRIMARY KEY (pattern_id, cluster_id)
);

-- Store statistical signatures for each modification type
CREATE TABLE modification_signatures (
                                         id SERIAL PRIMARY KEY,
                                         modification_type_id INTEGER REFERENCES modification_types(id),
                                         family_id INTEGER REFERENCES ecu_families(id),
                                         signature_data JSONB, -- statistical fingerprint
                                         sample_count INTEGER DEFAULT 0,
                                         accuracy_score FLOAT DEFAULT 0.0,
                                         created_at TIMESTAMP DEFAULT NOW(),
                                         updated_at TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX idx_patterns_type_family ON modification_patterns(modification_type_id, family_id);
CREATE INDEX idx_patterns_offset ON modification_patterns(file_offset);
CREATE INDEX idx_patterns_confidence ON modification_patterns(confidence DESC);
CREATE INDEX idx_samples_variant_type ON modification_samples(variant_id, modification_type_id);
