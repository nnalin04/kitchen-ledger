package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.exception.AccessDeniedException;
import com.kitchenledger.auth.security.JwtService;
import com.kitchenledger.auth.service.UserService;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

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

    @Value("${internal.service.secret:}")
    private String internalServiceSecret;

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

    private void checkInternalSecret(HttpServletRequest request) {
        String secret = request.getHeader("X-Internal-Service-Secret");
        if (internalServiceSecret == null || internalServiceSecret.isBlank()) {
            throw new IllegalStateException("INTERNAL_SERVICE_SECRET is not configured");
        }
        if (!internalServiceSecret.equals(secret)) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
