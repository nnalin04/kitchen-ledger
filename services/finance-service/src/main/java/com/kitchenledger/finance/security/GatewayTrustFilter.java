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
import org.slf4j.MDC;

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

        String correlationId = request.getHeader("x-correlation-id");
        MDC.put("correlationId", correlationId != null ? correlationId : "none");

        // Internal service-to-service calls and health checks bypass gateway header validation.
        // They are protected by INTERNAL_SERVICE_SECRET or need no auth.
        if (path.startsWith("/internal/") || path.startsWith("/actuator/")) {
            try {
                filterChain.doFilter(request, response);
            } finally {
                MDC.remove("correlationId");
            }
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

        // Populate thread-locals so TenantRlsAspect can set the PostgreSQL session variables
        // that activate RLS policies and supply the current user to the audit trigger.
        TenantContext.set(rawTenantId);
        TenantContext.setUserId(rawUserId);
        
        try {
            filterChain.doFilter(request, response);
        } finally {
            // Always clear — prevents context leakage when threads are reused by the pool.
            TenantContext.clear();
            MDC.remove("correlationId");
        }
    }
}
