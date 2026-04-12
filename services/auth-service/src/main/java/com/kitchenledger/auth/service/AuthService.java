package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.*;
import com.kitchenledger.auth.dto.response.AuthResponse;
import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ConflictException;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
import com.kitchenledger.auth.exception.ValidationException;
import com.kitchenledger.auth.model.RefreshToken;
import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.UserRole;
import com.kitchenledger.auth.repository.RefreshTokenRepository;
import com.kitchenledger.auth.repository.TenantRepository;
import com.kitchenledger.auth.repository.UserRepository;
import com.kitchenledger.auth.security.JwtService;
import com.kitchenledger.auth.security.PasswordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Base64;
import java.util.HexFormat;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AuthService {

    private final TenantRepository tenantRepository;
    private final UserRepository userRepository;
    private final RefreshTokenRepository refreshTokenRepository;
    private final JwtService jwtService;
    private final PasswordService passwordService;
    private final AuthEventPublisher eventPublisher;
    private final AccountSeedService accountSeedService;

    @Value("${jwt.refresh-token-expiry-days:30}")
    private long refreshTokenExpiryDays;

    @Value("${jwt.access-token-expiry-minutes:15}")
    private long accessTokenExpiryMinutes;

    /**
     * Register a new tenant and owner account.
     */
    @Transactional
    public AuthResponse register(RegisterRequest req) {
        // 1. Email uniqueness (tenants table has UNIQUE on email)
        if (tenantRepository.existsByEmail(req.getEmail().toLowerCase())) {
            throw new ConflictException("An account with this email already exists");
        }

        // 2. Create tenant with auto-generated unique slug
        Tenant tenant = Tenant.builder()
                .restaurantName(req.getRestaurantName())
                .slug(generateUniqueSlug(req.getRestaurantName()))
                .email(req.getEmail().toLowerCase())
                .phone(req.getPhone())
                .timezone(req.getTimezone() != null ? req.getTimezone() : "Asia/Kolkata")
                .currency(req.getCurrency() != null ? req.getCurrency() : "INR")
                .trialEndsAt(Instant.now().plus(14, ChronoUnit.DAYS))
                .build();
        tenant = tenantRepository.save(tenant);

        // 3. Create owner user
        User user = User.builder()
                .tenantId(tenant.getId())
                .email(req.getEmail().toLowerCase())
                .hashedPassword(passwordService.hash(req.getPassword()))
                .fullName(req.getFullName())
                .phone(req.getPhone())
                .role(UserRole.owner)
                .active(true)
                .verified(false)
                .build();
        user = userRepository.save(user);

        // 4. Generate tokens
        String accessToken  = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken();

        // 5. Store hashed refresh token
        storeRefreshToken(user.getId(), refreshToken, null, null);

        // 6. Publish events — fire and forget (failures logged, not thrown)
        eventPublisher.publishUserRegistered(user, tenant);
        accountSeedService.seedNewTenant(tenant.getId()); // publishes auth.tenant.created

        log.info("New tenant registered: {} ({})", tenant.getSlug(), tenant.getId());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(accessTokenExpiryMinutes * 60)
                .user(UserResponse.from(user))
                .tenant(TenantResponse.from(tenant))
                .build();
    }

    /**
     * Login with email + password. Email is matched against the tenant that owns that email.
     */
    @Transactional
    public AuthResponse login(LoginRequest req, String ipAddress, String userAgent) {
        // Find tenant by email first (tenants.email is unique)
        Tenant tenant = tenantRepository.findByEmail(req.getEmail().toLowerCase())
                .orElseThrow(() -> new ValidationException("Invalid email or password"));

        // Find user within that tenant
        User user = userRepository.findByEmailAndTenantId(req.getEmail(), tenant.getId())
                .orElseThrow(() -> new ValidationException("Invalid email or password"));

        if (!user.isActive() || user.getDeletedAt() != null) {
            throw new ValidationException("Account is inactive");
        }

        if (!passwordService.matches(req.getPassword(), user.getHashedPassword())) {
            throw new ValidationException("Invalid email or password");
        }

        // Update last login
        user.setLastLoginAt(Instant.now());
        userRepository.save(user);

        String accessToken  = jwtService.generateAccessToken(user);
        String refreshToken = jwtService.generateRefreshToken();
        storeRefreshToken(user.getId(), refreshToken, ipAddress, userAgent);

        log.info("User logged in: {} (tenant: {})", user.getEmail(), tenant.getSlug());

        return AuthResponse.builder()
                .accessToken(accessToken)
                .refreshToken(refreshToken)
                .expiresIn(accessTokenExpiryMinutes * 60)
                .user(UserResponse.from(user))
                .tenant(TenantResponse.from(tenant))
                .build();
    }

    /**
     * Refresh access token using a valid refresh token.
     */
    @Transactional
    public AuthResponse refresh(RefreshTokenRequest req) {
        String hash = sha256Hex(req.getRefreshToken());
        RefreshToken rt = refreshTokenRepository.findByTokenHash(hash)
                .orElseThrow(() -> new ValidationException("Invalid refresh token"));

        if (rt.isRevoked() || rt.isExpired()) {
            throw new ValidationException("Refresh token is expired or revoked");
        }

        User user = userRepository.findByIdAndDeletedAtIsNull(rt.getUserId())
                .orElseThrow(() -> new ValidationException("User not found"));

        if (!user.isActive()) {
            throw new ValidationException("Account is inactive");
        }

        Tenant tenant = tenantRepository.findById(user.getTenantId())
                .orElseThrow(() -> new ResourceNotFoundException("Tenant", user.getTenantId()));

        // Rotate refresh token (sliding window)
        rt.setRevokedAt(Instant.now());
        refreshTokenRepository.save(rt);
        String newRefreshToken = jwtService.generateRefreshToken();
        storeRefreshToken(user.getId(), newRefreshToken, null, null);

        String newAccessToken = jwtService.generateAccessToken(user);

        return AuthResponse.builder()
                .accessToken(newAccessToken)
                .refreshToken(newRefreshToken)
                .expiresIn(accessTokenExpiryMinutes * 60)
                .user(UserResponse.from(user))
                .tenant(TenantResponse.from(tenant))
                .build();
    }

    /**
     * Logout: revoke the refresh token.
     * Note: access token revocation via Redis JTI is a Phase 2 enhancement.
     */
    @Transactional
    public void logout(LogoutRequest req) {
        String hash = sha256Hex(req.getRefreshToken());
        refreshTokenRepository.findByTokenHash(hash).ifPresent(rt -> {
            rt.setRevokedAt(Instant.now());
            refreshTokenRepository.save(rt);
        });
    }

    /**
     * Change password for the currently authenticated user.
     */
    @Transactional
    public void changePassword(UUID userId, ChangePasswordRequest req) {
        User user = userRepository.findByIdAndDeletedAtIsNull(userId)
                .orElseThrow(() -> new ResourceNotFoundException("User", userId));

        if (!passwordService.matches(req.getCurrentPassword(), user.getHashedPassword())) {
            throw new ValidationException("Current password is incorrect");
        }

        user.setHashedPassword(passwordService.hash(req.getNewPassword()));
        // Revoke all existing refresh tokens (force re-login on all devices)
        refreshTokenRepository.revokeAllByUserId(userId);
        userRepository.save(user);
    }

    // ────────────────────────────────────────────────────────────
    // Helpers
    // ────────────────────────────────────────────────────────────

    private void storeRefreshToken(UUID userId, String rawToken, String ipAddress, String userAgent) {
        RefreshToken rt = RefreshToken.builder()
                .userId(userId)
                .tokenHash(sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(refreshTokenExpiryDays, ChronoUnit.DAYS))
                .ipAddress(ipAddress)
                .userAgent(userAgent)
                .build();
        refreshTokenRepository.save(rt);
    }

    private String generateUniqueSlug(String restaurantName) {
        String base = restaurantName.toLowerCase()
                .replaceAll("[^a-z0-9\\s-]", "")
                .replaceAll("\\s+", "-")
                .replaceAll("-+", "-")
                .replaceAll("^-|-$", "");
        if (base.length() > 80) base = base.substring(0, 80);

        String slug = base;
        int suffix = 1;
        while (tenantRepository.existsBySlug(slug)) {
            slug = base + "-" + suffix++;
        }
        return slug;
    }

    static String sha256Hex(String input) {
        try {
            byte[] hash = MessageDigest.getInstance("SHA-256")
                    .digest(input.getBytes(StandardCharsets.UTF_8));
            return HexFormat.of().formatHex(hash);
        } catch (Exception e) {
            throw new RuntimeException("SHA-256 not available", e);
        }
    }
}
