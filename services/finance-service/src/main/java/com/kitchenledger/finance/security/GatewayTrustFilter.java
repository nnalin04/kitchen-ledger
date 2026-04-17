package com.kitchenledger.finance.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import java.util.UUID;

@Component
public class GatewayTrustFilter extends OncePerRequestFilter {

    public static final String ATTR_USER_ID   = "userId";
    public static final String ATTR_TENANT_ID = "tenantId";
    public static final String ATTR_USER_ROLE = "userRole";

    @Override
    protected void doFilterInternal(HttpServletRequest request,
                                    HttpServletResponse response,
                                    FilterChain filterChain)
            throws ServletException, IOException {

        String path = request.getRequestURI();

        // Internal service-to-service calls and health checks bypass gateway header validation.
        // They are protected by INTERNAL_SERVICE_SECRET or need no auth.
        if (path.startsWith("/internal/") || path.startsWith("/actuator/")) {
            filterChain.doFilter(request, response);
            return;
        }

        String rawUserId   = request.getHeader("x-user-id");
        String rawTenantId = request.getHeader("x-tenant-id");
        String rawRole     = request.getHeader("x-user-role");

        // Reject any request missing mandatory gateway headers — defense-in-depth in case
        // a misconfigured network allows traffic to bypass the gateway.
        if (rawUserId == null || rawTenantId == null) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"Missing gateway authentication headers\"}");
            return;
        }

        try {
            request.setAttribute(ATTR_USER_ID, UUID.fromString(rawUserId));
        } catch (IllegalArgumentException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"Malformed x-user-id header\"}");
            return;
        }

        try {
            request.setAttribute(ATTR_TENANT_ID, UUID.fromString(rawTenantId));
        } catch (IllegalArgumentException e) {
            response.setStatus(HttpServletResponse.SC_UNAUTHORIZED);
            response.setContentType(MediaType.APPLICATION_JSON_VALUE);
            response.getWriter().write("{\"error\":\"Malformed x-tenant-id header\"}");
            return;
        }

        if (rawRole != null) {
            request.setAttribute(ATTR_USER_ROLE, rawRole);
        }

        // Populate thread-local so TenantRlsAspect can set the PostgreSQL session variable
        // that activates RLS policies on all tenant-scoped tables.
        TenantContext.set(rawTenantId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            // Always clear — prevents context leakage when threads are reused by the pool.
            TenantContext.clear();
        }
    }
}
