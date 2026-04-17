package com.kitchenledger.auth.security;

/**
 * Thread-local holder for the current tenant ID extracted from Gateway headers.
 * Populated by {@link GatewayTrustFilter} at the start of each request and
 * cleared in the filter's finally block to prevent context leakage across threads.
 *
 * Used by {@link TenantRlsAspect} to propagate the tenant identity into the
 * PostgreSQL session variable {@code app.current_tenant_id}, which activates
 * the Row-Level Security policies defined on every tenant-scoped table.
 */
public final class TenantContext {

    private static final ThreadLocal<String> CURRENT_TENANT = new ThreadLocal<>();

    private TenantContext() {}

    public static void set(String tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static String get() {
        return CURRENT_TENANT.get();
    }

    public static void clear() {
        CURRENT_TENANT.remove();
    }
}
