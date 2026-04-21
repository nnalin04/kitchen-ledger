package com.kitchenledger.finance.security;

/**
 * Thread-local holder for the current tenant ID and user ID extracted from
 * Gateway headers.  Populated by {@link GatewayTrustFilter} at the start of
 * each request and cleared in the filter's finally block to prevent context
 * leakage across threads.
 *
 * Used by {@link TenantRlsAspect} to propagate the tenant and user identity
 * into the PostgreSQL session variables {@code app.current_tenant_id} and
 * {@code app.current_user_id}, which activate RLS policies and supply values
 * to the audit trigger function.
 */
public final class TenantContext {

    private static final ThreadLocal<String> CURRENT_TENANT   = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_USER     = new ThreadLocal<>();
    private static final ThreadLocal<String> CURRENT_CURRENCY = new ThreadLocal<>();

    private TenantContext() {}

    public static void set(String tenantId) {
        CURRENT_TENANT.set(tenantId);
    }

    public static String get() {
        return CURRENT_TENANT.get();
    }

    public static void setUserId(String userId) {
        CURRENT_USER.set(userId);
    }

    public static String getUserId() {
        return CURRENT_USER.get();
    }

    public static void setCurrency(String currency) {
        CURRENT_CURRENCY.set(currency);
    }

    /**
     * Returns the tenant's configured currency for the current request thread.
     * Falls back to {@code "INR"} when the header was not forwarded by the Gateway
     * (e.g. internal health-check calls).
     */
    public static String getCurrency() {
        String c = CURRENT_CURRENCY.get();
        return (c != null && !c.isBlank()) ? c : "INR";
    }

    public static void clear() {
        CURRENT_TENANT.remove();
        CURRENT_USER.remove();
        CURRENT_CURRENCY.remove();
    }
}
