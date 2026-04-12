package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.*;
import com.kitchenledger.auth.dto.response.AuthResponse;
import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ConflictException;
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
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AuthServiceTest {

    @Mock TenantRepository tenantRepository;
    @Mock UserRepository userRepository;
    @Mock RefreshTokenRepository refreshTokenRepository;
    @Mock JwtService jwtService;
    @Mock PasswordService passwordService;
    @Mock AuthEventPublisher eventPublisher;
    @Mock AccountSeedService accountSeedService;

    @InjectMocks AuthService authService;

    private Tenant tenant;
    private User owner;

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(authService, "refreshTokenExpiryDays", 30L);
        ReflectionTestUtils.setField(authService, "accessTokenExpiryMinutes", 15L);

        tenant = Tenant.builder()
                .id(UUID.randomUUID())
                .restaurantName("Spice Garden")
                .slug("spice-garden")
                .email("owner@spicegarden.com")
                .build();

        owner = User.builder()
                .id(UUID.randomUUID())
                .tenantId(tenant.getId())
                .email("owner@spicegarden.com")
                .hashedPassword("$2a$12$hashed")
                .role(UserRole.owner)
                .active(true)
                .verified(false)
                .build();
    }

    // ── register ──────────────────────────────────────────────────

    @Test
    void register_success_returnsAuthResponse() {
        RegisterRequest req = new RegisterRequest();
        req.setRestaurantName("Spice Garden");
        req.setEmail("owner@spicegarden.com");
        req.setPassword("password123");
        req.setFullName("Ravi Kumar");

        when(tenantRepository.existsByEmail(anyString())).thenReturn(false);
        when(tenantRepository.existsBySlug(anyString())).thenReturn(false);
        when(tenantRepository.save(any())).thenReturn(tenant);
        when(userRepository.save(any())).thenReturn(owner);
        when(passwordService.hash(anyString())).thenReturn("$2a$12$hashed");
        when(jwtService.generateAccessToken(any())).thenReturn("access-token");
        when(jwtService.generateRefreshToken()).thenReturn(UUID.randomUUID().toString());
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AuthResponse result = authService.register(req);

        assertThat(result.getAccessToken()).isEqualTo("access-token");
        assertThat(result.getRefreshToken()).isNotBlank();
        assertThat(result.getUser().getEmail()).isEqualTo("owner@spicegarden.com");

        verify(eventPublisher).publishUserRegistered(any(), any());
        verify(accountSeedService).seedNewTenant(any());
    }

    @Test
    void register_duplicateEmail_throwsConflictException() {
        RegisterRequest req = new RegisterRequest();
        req.setRestaurantName("Other Place");
        req.setEmail("owner@spicegarden.com");
        req.setPassword("password123");
        req.setFullName("Someone");

        when(tenantRepository.existsByEmail("owner@spicegarden.com")).thenReturn(true);

        assertThatThrownBy(() -> authService.register(req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already exists");
    }

    // ── login ─────────────────────────────────────────────────────

    @Test
    void login_correctCredentials_returnsAuthResponse() {
        LoginRequest req = new LoginRequest();
        req.setEmail("owner@spicegarden.com");
        req.setPassword("password123");

        when(tenantRepository.findByEmail("owner@spicegarden.com")).thenReturn(Optional.of(tenant));
        when(userRepository.findByEmailAndTenantId(anyString(), any())).thenReturn(Optional.of(owner));
        when(passwordService.matches("password123", "$2a$12$hashed")).thenReturn(true);
        when(userRepository.save(any())).thenReturn(owner);
        when(jwtService.generateAccessToken(any())).thenReturn("access-token");
        when(jwtService.generateRefreshToken()).thenReturn(UUID.randomUUID().toString());
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        AuthResponse result = authService.login(req, "127.0.0.1", "TestAgent/1.0");

        assertThat(result.getAccessToken()).isEqualTo("access-token");
        assertThat(result.getUser().getEmail()).isEqualTo("owner@spicegarden.com");
    }

    @Test
    void login_wrongPassword_throwsValidationException() {
        LoginRequest req = new LoginRequest();
        req.setEmail("owner@spicegarden.com");
        req.setPassword("wrongpassword");

        when(tenantRepository.findByEmail("owner@spicegarden.com")).thenReturn(Optional.of(tenant));
        when(userRepository.findByEmailAndTenantId(anyString(), any())).thenReturn(Optional.of(owner));
        when(passwordService.matches("wrongpassword", "$2a$12$hashed")).thenReturn(false);

        assertThatThrownBy(() -> authService.login(req, null, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid email or password");
    }

    @Test
    void login_unknownEmail_throwsValidationException() {
        LoginRequest req = new LoginRequest();
        req.setEmail("nobody@example.com");
        req.setPassword("pass");

        when(tenantRepository.findByEmail("nobody@example.com")).thenReturn(Optional.empty());

        assertThatThrownBy(() -> authService.login(req, null, null))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void login_inactiveUser_throwsValidationException() {
        owner.setActive(false);

        LoginRequest req = new LoginRequest();
        req.setEmail("owner@spicegarden.com");
        req.setPassword("password123");

        when(tenantRepository.findByEmail("owner@spicegarden.com")).thenReturn(Optional.of(tenant));
        when(userRepository.findByEmailAndTenantId(anyString(), any())).thenReturn(Optional.of(owner));

        assertThatThrownBy(() -> authService.login(req, null, null))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("inactive");
    }

    // ── refresh ───────────────────────────────────────────────────

    @Test
    void refresh_validToken_returnsNewAccessToken() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        RefreshToken rt = RefreshToken.builder()
                .id(UUID.randomUUID())
                .userId(owner.getId())
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(10, ChronoUnit.DAYS))
                .build();

        RefreshTokenRequest req = new RefreshTokenRequest();
        req.setRefreshToken(rawToken);

        when(refreshTokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(rt));
        when(userRepository.findByIdAndDeletedAtIsNull(owner.getId())).thenReturn(Optional.of(owner));
        when(tenantRepository.findById(owner.getTenantId())).thenReturn(Optional.of(tenant));
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(jwtService.generateAccessToken(any())).thenReturn("new-access-token");
        when(jwtService.generateRefreshToken()).thenReturn(UUID.randomUUID().toString());

        AuthResponse result = authService.refresh(req);

        assertThat(result.getAccessToken()).isEqualTo("new-access-token");
        verify(refreshTokenRepository, times(2)).save(any()); // revoke old + store new
    }

    @Test
    void refresh_revokedToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        RefreshToken rt = RefreshToken.builder()
                .userId(owner.getId())
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(10, ChronoUnit.DAYS))
                .revokedAt(Instant.now().minus(1, ChronoUnit.HOURS))
                .build();

        RefreshTokenRequest req = new RefreshTokenRequest();
        req.setRefreshToken(rawToken);

        when(refreshTokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(rt));

        assertThatThrownBy(() -> authService.refresh(req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("expired or revoked");
    }

    @Test
    void refresh_expiredToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        RefreshToken rt = RefreshToken.builder()
                .userId(owner.getId())
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().minus(1, ChronoUnit.HOURS)) // expired
                .build();

        RefreshTokenRequest req = new RefreshTokenRequest();
        req.setRefreshToken(rawToken);

        when(refreshTokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(rt));

        assertThatThrownBy(() -> authService.refresh(req))
                .isInstanceOf(ValidationException.class);
    }

    // ── logout ────────────────────────────────────────────────────

    @Test
    void logout_validRefreshToken_revokesIt() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        RefreshToken rt = RefreshToken.builder()
                .userId(owner.getId())
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(10, ChronoUnit.DAYS))
                .build();

        LogoutRequest req = new LogoutRequest();
        req.setRefreshToken(rawToken);

        when(refreshTokenRepository.findByTokenHash(tokenHash)).thenReturn(Optional.of(rt));
        when(refreshTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        authService.logout(req);

        assertThat(rt.getRevokedAt()).isNotNull();
        verify(refreshTokenRepository).save(rt);
    }

    @Test
    void logout_unknownToken_doesNotThrow() {
        LogoutRequest req = new LogoutRequest();
        req.setRefreshToken(UUID.randomUUID().toString());

        when(refreshTokenRepository.findByTokenHash(anyString())).thenReturn(Optional.empty());

        assertThatCode(() -> authService.logout(req)).doesNotThrowAnyException();
    }

    // ── changePassword ────────────────────────────────────────────

    @Test
    void changePassword_correctCurrentPassword_updatesHash() {
        ChangePasswordRequest req = new ChangePasswordRequest();
        req.setCurrentPassword("oldpass");
        req.setNewPassword("newpass123");

        when(userRepository.findByIdAndDeletedAtIsNull(owner.getId())).thenReturn(Optional.of(owner));
        when(passwordService.matches("oldpass", "$2a$12$hashed")).thenReturn(true);
        when(passwordService.hash("newpass123")).thenReturn("$2a$12$newhash");
        when(userRepository.save(any())).thenReturn(owner);

        authService.changePassword(owner.getId(), req);

        assertThat(owner.getHashedPassword()).isEqualTo("$2a$12$newhash");
        verify(refreshTokenRepository).revokeAllByUserId(owner.getId());
    }

    @Test
    void changePassword_wrongCurrentPassword_throwsValidationException() {
        ChangePasswordRequest req = new ChangePasswordRequest();
        req.setCurrentPassword("wrongpass");
        req.setNewPassword("newpass123");

        when(userRepository.findByIdAndDeletedAtIsNull(owner.getId())).thenReturn(Optional.of(owner));
        when(passwordService.matches("wrongpass", "$2a$12$hashed")).thenReturn(false);

        assertThatThrownBy(() -> authService.changePassword(owner.getId(), req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("incorrect");
    }
}
