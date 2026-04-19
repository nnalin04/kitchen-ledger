package com.kitchenledger.auth.security;

import jakarta.servlet.FilterChain;
import jakarta.servlet.ServletException;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.servlet.http.HttpServletResponse;
import org.springframework.lang.NonNull;
import org.springframework.stereotype.Component;
import org.springframework.web.filter.OncePerRequestFilter;

import java.io.IOException;
import org.slf4j.MDC;

/**
 * Reads X-User-Id, X-Tenant-Id, X-User-Role headers injected by the API Gateway
 * and stores them as request attributes for use in service layer and controllers.
 *
 * IMPORTANT: These headers are only trusted when the request comes from the Gateway.
 * The Gateway is the single JWT verification point — this service does NOT verify JWTs.
 */
@Component
public class GatewayTrustFilter extends OncePerRequestFilter {

    public static final String ATTR_USER_ID    = "kl.userId";
    public static final String ATTR_TENANT_ID  = "kl.tenantId";
    public static final String ATTR_USER_ROLE  = "kl.userRole";

    @Override
    protected void doFilterInternal(
            @NonNull HttpServletRequest request,
            @NonNull HttpServletResponse response,
            @NonNull FilterChain filterChain
    ) throws ServletException, IOException {
        String userId   = request.getHeader("x-user-id");
        String tenantId = request.getHeader("x-tenant-id");
        String userRole = request.getHeader("x-user-role");

        String correlationId = request.getHeader("x-correlation-id");
        MDC.put("correlationId", correlationId != null ? correlationId : "none");

        String path = request.getRequestURI();
        if (path.startsWith("/internal/") || path.startsWith("/actuator/")) {
            try {
                filterChain.doFilter(request, response);
            } finally {
                MDC.remove("correlationId");
            }
            return;
        }

        if (userId != null)   request.setAttribute(ATTR_USER_ID, userId);
        if (tenantId != null) request.setAttribute(ATTR_TENANT_ID, tenantId);
        if (userRole != null) request.setAttribute(ATTR_USER_ROLE, userRole);

        if (tenantId != null) TenantContext.set(tenantId);
        if (userId != null)   TenantContext.setUserId(userId);
        try {
            filterChain.doFilter(request, response);
        } finally {
            TenantContext.clear();
            MDC.remove("correlationId");
        }
    }
}
