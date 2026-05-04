package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.exception.AccessDeniedException;
import com.kitchenledger.auth.model.enums.TokenType;
import com.kitchenledger.auth.repository.AuthTokenRepository;
import com.kitchenledger.auth.security.JwtService;
import com.kitchenledger.auth.service.TenantService;
import com.kitchenledger.auth.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/**
 * Internal endpoints used by the API Gateway and other services.
 * All routes here are protected by INTERNAL_SERVICE_SECRET header check.
 * They are NOT routed through the Gateway's JWT verification.
 */
@RestController
@RequestMapping("/internal/auth")
@RequiredArgsConstructor
public class InternalAuthController {

    private final JwtService jwtService;
    private final UserService userService;
    private final TenantService tenantService;
    private final AuthTokenRepository authTokenRepository;

    @Value("${internal.service.secret:}")
    private String internalServiceSecret;

    @Value("${app.web-url:http://localhost:3000}")
    private String webUrl;

    /**
     * Used by Gateway to verify a JWT token and extract its claims.
     * Returns: { valid: true, payload: { user_id, tenant_id, role } }
     */
    @PostMapping("/verify-token")
    public ResponseEntity<Map<String, Object>> verifyToken(
            @RequestBody Map<String, String> body,
            HttpServletRequest request) {
        checkInternalSecret(request);

        String token = body.get("token");
        if (token == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("valid", false, "error", "token is required"));
        }

        try {
            Claims claims = jwtService.validateToken(token);
            return ResponseEntity.ok(Map.of(
                    "valid", true,
                    "payload", Map.of(
                            "user_id", claims.getSubject(),
                            "tenant_id", claims.get("tenant_id", String.class),
                            "role", claims.get("role", String.class),
                            "jti", claims.getId()
                    )
            ));
        } catch (JwtException e) {
            return ResponseEntity.ok(Map.of("valid", false, "reason", "invalid_or_expired"));
        }
    }

    /**
     * Used by other services to look up a user by ID.
     */
    @GetMapping("/users/{userId}")
    public ResponseEntity<Map<String, Object>> getUser(
            @PathVariable UUID userId,
            HttpServletRequest request) {
        checkInternalSecret(request);
        UserResponse user = userService.getById(userId);
        return ResponseEntity.ok(Map.of("success", true, "data", user));
    }

    /**
     * Used by notification-service to resolve push recipients by tenant + role.
     * roles param is comma-separated, e.g. ?tenantId=...&roles=owner,manager
     */
    @GetMapping("/users")
    public ResponseEntity<Map<String, Object>> getUsersByTenantAndRoles(
            @RequestParam UUID tenantId,
            @RequestParam(defaultValue = "owner,manager") List<String> roles,
            HttpServletRequest request) {
        checkInternalSecret(request);
        var users = userService.listByTenantAndRoles(tenantId, roles);
        return ResponseEntity.ok(Map.of("success", true, "data", users));
    }

    /**
     * Used by other services to resolve tenant config (timezone, currency) without
     * going through the public API Gateway.
     */
    @GetMapping("/tenants/{tenantId}")
    public ResponseEntity<Map<String, Object>> getTenant(
            @PathVariable UUID tenantId,
            HttpServletRequest request) {
        checkInternalSecret(request);
        TenantResponse tenant = tenantService.getById(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", tenant));
    }

    /**
     * Called by notification-service at email-send time to get a signed invite URL.
     * Returns the accept-invite URL constructed from the raw token stored in the
     * AuthToken metadata — without ever exposing the raw token over RabbitMQ or outbox.
     */
    @GetMapping("/invites/{userId}/link")
    public ResponseEntity<Map<String, String>> getInviteLink(
            @PathVariable UUID userId,
            HttpServletRequest request) {
        checkInternalSecret(request);

        var tokenOpt = authTokenRepository
                .findFirstByUserIdAndTokenTypeAndUsedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
                        userId, TokenType.invite, Instant.now());
        if (tokenOpt.isEmpty()) {
            return ResponseEntity.<Map<String, String>>notFound().build();
        }
        String rawToken = (String) tokenOpt.get().getMetadata().get("raw_token");
        if (rawToken == null || rawToken.isBlank()) {
            return ResponseEntity.<Map<String, String>>notFound().build();
        }
        String inviteUrl = webUrl + "/invite/accept?token=" + rawToken;
        return ResponseEntity.ok(Map.of("invite_url", inviteUrl));
    }

    private void checkInternalSecret(HttpServletRequest request) {
        String secret = request.getHeader("x-internal-secret");
        if (internalServiceSecret == null || internalServiceSecret.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_SECRET is not configured");
        }
        // Use constant-time comparison to prevent timing side-channel attacks that
        // could allow an attacker to enumerate the secret character-by-character.
        if (!java.security.MessageDigest.isEqual(
                internalServiceSecret.getBytes(java.nio.charset.StandardCharsets.UTF_8),
                (secret != null ? secret : "").getBytes(java.nio.charset.StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
