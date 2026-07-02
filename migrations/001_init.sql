-- SurveyBox initial schema

CREATE EXTENSION IF NOT EXISTS "pgcrypto";

CREATE TYPE survey_status AS ENUM ('draft', 'published', 'paused', 'archived');
CREATE TYPE share_status AS ENUM ('pending', 'opened', 'submitted', 'expired');
CREATE TYPE file_status AS ENUM ('uploaded', 'bound', 'deleted');

CREATE TABLE users (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    username VARCHAR(64) NOT NULL UNIQUE,
    password_hash TEXT NOT NULL,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE surveys (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    title VARCHAR(255) NOT NULL DEFAULT '未命名问卷',
    description TEXT NOT NULL DEFAULT '',
    status survey_status NOT NULL DEFAULT 'draft',
    current_version_id UUID,
    allow_multiple_submit BOOLEAN NOT NULL DEFAULT FALSE,
    success_message TEXT NOT NULL DEFAULT '感谢您的填写！',
    created_by UUID NOT NULL REFERENCES users(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE survey_versions (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    version_no INT NOT NULL DEFAULT 1,
    schema JSONB NOT NULL DEFAULT '{"version":1,"fields":[]}',
    html_template TEXT NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (survey_id, version_no)
);

ALTER TABLE surveys
    ADD CONSTRAINT fk_surveys_current_version
    FOREIGN KEY (current_version_id) REFERENCES survey_versions(id);

CREATE TABLE contacts (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    name VARCHAR(128) NOT NULL,
    email VARCHAR(255) NOT NULL UNIQUE,
    company VARCHAR(255) NOT NULL DEFAULT '',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE shares (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    survey_id UUID NOT NULL REFERENCES surveys(id) ON DELETE CASCADE,
    contact_id UUID NOT NULL REFERENCES contacts(id),
    token VARCHAR(128) NOT NULL UNIQUE,
    status share_status NOT NULL DEFAULT 'pending',
    expires_at TIMESTAMPTZ,
    submitted_at TIMESTAMPTZ,
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    UNIQUE (survey_id, contact_id)
);

CREATE TABLE responses (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL UNIQUE REFERENCES shares(id),
    answers JSONB NOT NULL DEFAULT '{}',
    submitted_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE files (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    share_id UUID NOT NULL REFERENCES shares(id) ON DELETE CASCADE,
    field_id VARCHAR(64) NOT NULL,
    storage_key VARCHAR(512) NOT NULL,
    storage_backend VARCHAR(16) NOT NULL DEFAULT 'local',
    filename VARCHAR(255) NOT NULL,
    mime VARCHAR(128),
    size BIGINT NOT NULL DEFAULT 0,
    sha256 CHAR(64),
    status file_status NOT NULL DEFAULT 'uploaded',
    response_id UUID REFERENCES responses(id),
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE TABLE revoked_tokens (
    jti VARCHAR(64) PRIMARY KEY,
    expires_at TIMESTAMPTZ NOT NULL
);

CREATE TABLE audit_logs (
    id BIGSERIAL PRIMARY KEY,
    actor_type VARCHAR(16) NOT NULL,
    actor_id VARCHAR(64),
    action VARCHAR(64) NOT NULL,
    resource VARCHAR(128),
    ip INET,
    user_agent TEXT,
    meta JSONB NOT NULL DEFAULT '{}',
    created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

CREATE INDEX idx_surveys_created_by ON surveys(created_by);
CREATE INDEX idx_surveys_status ON surveys(status);
CREATE INDEX idx_shares_token ON shares(token);
CREATE INDEX idx_shares_survey_id ON shares(survey_id);
CREATE INDEX idx_files_share_id ON files(share_id);
CREATE INDEX idx_audit_logs_created_at ON audit_logs(created_at);
