package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.dto.request.*;
import com.kitchenledger.auth.dto.response.AuthResponse;
import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.service.AuthService;
import com.kitchenledger.auth.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth")
@RequiredArgsConstructor
public class AuthController {

    private final AuthService authService;
    private final UserService userService;

    // ── Public endpoints ─────────────────────────────────────────

    @PostMapping("/register")
    public ResponseEntity<Map<String, Object>> register(
            @Valid @RequestBody RegisterRequest req) {
        AuthResponse authResponse = authService.register(req);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", authResponse));
    }

    @PostMapping("/login")
    public ResponseEntity<Map<String, Object>> login(
            @Valid @RequestBody LoginRequest req,
            HttpServletRequest httpRequest) {
        String ip = httpRequest.getRemoteAddr();
        String ua = httpRequest.getHeader("User-Agent");
        AuthResponse authResponse = authService.login(req, ip, ua);
        return ResponseEntity.ok(Map.of("success", true, "data", authResponse));
    }

    @PostMapping("/refresh")
    public ResponseEntity<Map<String, Object>> refresh(
            @Valid @RequestBody RefreshTokenRequest req) {
        AuthResponse authResponse = authService.refresh(req);
        return ResponseEntity.ok(Map.of("success", true, "data", authResponse));
    }

    // ── Authenticated endpoints (require Gateway headers) ───────

    @PostMapping("/logout")
    public ResponseEntity<Map<String, Object>> logout(
            @Valid @RequestBody LogoutRequest req) {
        authService.logout(req);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @GetMapping("/me")
    public ResponseEntity<Map<String, Object>> getMe(HttpServletRequest request) {
        UUID userId = extractUserId(request);
        UserResponse user = userService.getById(userId);
        return ResponseEntity.ok(Map.of("success", true, "data", user));
    }

    @PatchMapping("/me")
    public ResponseEntity<Map<String, Object>> updateMe(
            @Valid @RequestBody UpdateProfileRequest req,
            HttpServletRequest request) {
        UUID userId = extractUserId(request);
        UserResponse user = userService.updateProfile(userId, req);
        return ResponseEntity.ok(Map.of("success", true, "data", user));
    }

    @PostMapping("/me/change-password")
    public ResponseEntity<Map<String, Object>> changePassword(
            @Valid @RequestBody ChangePasswordRequest req,
            HttpServletRequest request) {
        UUID userId = extractUserId(request);
        authService.changePassword(userId, req);
        return ResponseEntity.ok(Map.of("success", true));
    }

    // ── Helpers ──────────────────────────────────────────────────

    private UUID extractUserId(HttpServletRequest request) {
        Object attr = request.getAttribute("kl.userId");
        if (attr == null) {
            String header = request.getHeader("x-user-id");
            if (header == null) throw new RuntimeException("Missing user context");
            return UUID.fromString(header);
        }
        return UUID.fromString(attr.toString());
    }

    private UUID extractTenantId(HttpServletRequest request) {
        Object attr = request.getAttribute("kl.tenantId");
        if (attr == null) {
            String header = request.getHeader("x-tenant-id");
            if (header == null) throw new RuntimeException("Missing tenant context");
            return UUID.fromString(header);
        }
        return UUID.fromString(attr.toString());
    }
}
