-- ====================================================
-- Flyway migration: V1__auth_schema.sql
-- Auth Service owns: tenants, users, refresh_tokens,
--                    auth_tokens, auth_audit_logs
-- ====================================================

-- TENANTS
CREATE TABLE tenants (
    id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    restaurant_name     VARCHAR(200) NOT NULL,
    slug                VARCHAR(100) UNIQUE NOT NULL,
    email               VARCHAR(255) UNIQUE NOT NULL,
    phone               VARCHAR(20),
    address_line1       VARCHAR(255),
    address_line2       VARCHAR(255),
    city                VARCHAR(100),
    state               VARCHAR(100),
    country             CHAR(3) NOT NULL DEFAULT 'IND',
    postal_code         VARCHAR(20),
    timezone            VARCHAR(50) NOT NULL DEFAULT 'Asia/Kolkata',
    currency            CHAR(3) NOT NULL DEFAULT 'INR',
    locale              VARCHAR(10) NOT NULL DEFAULT 'en-IN',
    subscription_tier   VARCHAR(20) NOT NULL DEFAULT 'starter'
                        CHECK (subscription_tier IN ('starter','growth','professional','enterprise')),
    subscription_status VARCHAR(20) NOT NULL DEFAULT 'trialing'
                        CHECK (subscription_status IN ('trialing','active','past_due','canceled')),
    trial_ends_at       TIMESTAMPTZ,
    settings            JSONB NOT NULL DEFAULT '{}',
    onboarding_step     INT NOT NULL DEFAULT 0,
    onboarding_done     BOOLEAN NOT NULL DEFAULT FALSE,
    created_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at          TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at          TIMESTAMPTZ
);

-- USERS
CREATE TABLE users (
    id              UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id       UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
    email           VARCHAR(255) NOT NULL,
    hashed_password VARCHAR(255) NOT NULL,
    full_name       VARCHAR(200) NOT NULL,
    phone           VARCHAR(20),
    role            VARCHAR(20) NOT NULL DEFAULT 'kitchen_staff'
                    CHECK (role IN ('owner','manager','kitchen_staff','server')),
    is_active       BOOLEAN NOT NULL DEFAULT TRUE,
    is_verified     BOOLEAN NOT NULL DEFAULT FALSE,
    last_login_at   TIMESTAMPTZ,
    avatar_url      VARCHAR(500),
    pin_hash        VARCHAR(255),
    language        VARCHAR(10) NOT NULL DEFAULT 'en',
    created_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    updated_at      TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    deleted_at      TIMESTAMPTZ,
    UNIQUE (tenant_id, email)
);
CREATE INDEX idx_users_tenant ON users(tenant_id) WHERE deleted_at IS NULL;
CREATE INDEX idx_users_email ON users(email) WHERE deleted_at IS NULL;

-- REFRESH TOKENS
CREATE TABLE refresh_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    revoked_at  TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    user_agent  VARCHAR(500),
    ip_address  INET
);
CREATE INDEX idx_refresh_tokens_user ON refresh_tokens(user_id) WHERE revoked_at IS NULL;

-- VERIFICATION TOKENS (email verify, password reset, invites)
CREATE TABLE auth_tokens (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    user_id     UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
    token_type  VARCHAR(30) NOT NULL
                CHECK (token_type IN ('email_verify','password_reset','invite')),
    token_hash  VARCHAR(255) NOT NULL UNIQUE,
    expires_at  TIMESTAMPTZ NOT NULL,
    used_at     TIMESTAMPTZ,
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
    metadata    JSONB NOT NULL DEFAULT '{}'
);
CREATE INDEX idx_auth_tokens_user ON auth_tokens(user_id);
CREATE INDEX idx_auth_tokens_type ON auth_tokens(token_type, expires_at) WHERE used_at IS NULL;

-- AUTH AUDIT LOG
CREATE TABLE auth_audit_logs (
    id          UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    tenant_id   UUID REFERENCES tenants(id),
    user_id     UUID REFERENCES users(id),
    event_type  VARCHAR(100) NOT NULL,
    ip_address  INET,
    user_agent  VARCHAR(500),
    metadata    JSONB NOT NULL DEFAULT '{}',
    created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX idx_auth_audit_tenant ON auth_audit_logs(tenant_id, created_at DESC);
CREATE INDEX idx_auth_audit_user ON auth_audit_logs(user_id, created_at DESC);

-- ====================================================
-- Row-Level Security
-- ====================================================

ALTER TABLE tenants ENABLE ROW LEVEL SECURITY;
ALTER TABLE users ENABLE ROW LEVEL SECURITY;
ALTER TABLE refresh_tokens ENABLE ROW LEVEL SECURITY;
ALTER TABLE auth_tokens ENABLE ROW LEVEL SECURITY;

-- Allow service role (kl_user) to bypass RLS for maintenance operations
-- Application code sets app.current_tenant_id for tenant isolation
CREATE POLICY tenant_isolation_users ON users
    USING (tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID);

CREATE POLICY tenant_isolation_refresh_tokens ON refresh_tokens
    USING (user_id IN (
        SELECT id FROM users
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));

CREATE POLICY tenant_isolation_auth_tokens ON auth_tokens
    USING (user_id IN (
        SELECT id FROM users
        WHERE tenant_id = current_setting('app.current_tenant_id', TRUE)::UUID
    ));

-- Tenants row is always readable/writable by the owning service (no multi-tenancy on tenants itself)
CREATE POLICY tenants_service_access ON tenants
    USING (TRUE);

-- ====================================================
-- Audit trigger (updated_at auto-update)
-- ====================================================

CREATE OR REPLACE FUNCTION update_updated_at()
RETURNS TRIGGER AS $$
BEGIN
    NEW.updated_at = NOW();
    RETURN NEW;
END;
$$ LANGUAGE plpgsql;

CREATE TRIGGER trg_tenants_updated_at
    BEFORE UPDATE ON tenants
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();

CREATE TRIGGER trg_users_updated_at
    BEFORE UPDATE ON users
    FOR EACH ROW EXECUTE FUNCTION update_updated_at();
