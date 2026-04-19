package com.kitchenledger.auth.service;

import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ValidationException;
import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.TokenType;
import com.kitchenledger.auth.model.enums.UserRole;
import com.kitchenledger.auth.repository.AuthTokenRepository;
import com.kitchenledger.auth.repository.UserRepository;
import com.kitchenledger.auth.security.PasswordService;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class PasswordResetServiceTest {

    @Mock UserRepository userRepository;
    @Mock AuthTokenRepository authTokenRepository;
    @Mock PasswordService passwordService;
    @Mock AuthEventPublisher eventPublisher;

    @InjectMocks PasswordResetService passwordResetService;

    // ── forgotPassword ────────────────────────────────────────────────────────

    @Test
    void testForgotPassword_validEmail_createsTokenAndPublishesEvent() {
        User user = User.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .email("owner@spicegarden.com")
                .fullName("Ravi Kumar")
                .role(UserRole.owner)
                .build();

        when(userRepository.findByEmailGlobal("owner@spicegarden.com"))
                .thenReturn(Optional.of(user));
        when(authTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        passwordResetService.forgotPassword("owner@spicegarden.com");

        ArgumentCaptor<AuthToken> tokenCaptor = ArgumentCaptor.forClass(AuthToken.class);
        verify(authTokenRepository).save(tokenCaptor.capture());
        AuthToken saved = tokenCaptor.getValue();
        assertThat(saved.getTokenType()).isEqualTo(TokenType.password_reset);
        assertThat(saved.getUserId()).isEqualTo(user.getId());
        assertThat(saved.getExpiresAt()).isAfter(Instant.now());

        verify(eventPublisher).publishPasswordResetRequested(eq(user), anyString());
    }

    @Test
    void testForgotPassword_unknownEmail_doesNotLeakUserExistence() {
        // Unknown email: no exception thrown, no event published
        when(userRepository.findByEmailGlobal("ghost@example.com"))
                .thenReturn(Optional.empty());

        assertThatNoException()
                .isThrownBy(() -> passwordResetService.forgotPassword("ghost@example.com"));

        verify(authTokenRepository, never()).save(any());
        verify(eventPublisher, never()).publishPasswordResetRequested(any(), any());
    }

    // ── resetPassword ─────────────────────────────────────────────────────────

    @Test
    void testResetPassword_validToken_updatesPassword() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);
        UUID userId = UUID.randomUUID();

        AuthToken token = AuthToken.builder()
                .id(UUID.randomUUID())
                .userId(userId)
                .tokenType(TokenType.password_reset)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                .build();

        User user = User.builder()
                .id(userId)
                .hashedPassword("$2a$12$oldhash")
                .build();

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.password_reset))
                .thenReturn(Optional.of(token));
        when(userRepository.findByIdAndDeletedAtIsNull(userId))
                .thenReturn(Optional.of(user));
        when(passwordService.hash("newSecurePass1")).thenReturn("$2a$12$newhash");
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(authTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        passwordResetService.resetPassword(rawToken, "newSecurePass1");

        assertThat(user.getHashedPassword()).isEqualTo("$2a$12$newhash");
        assertThat(token.getUsedAt()).isNotNull();
        verify(userRepository).save(user);
        verify(authTokenRepository).save(token);
    }

    @Test
    void testResetPassword_expiredToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        AuthToken expiredToken = AuthToken.builder()
                .id(UUID.randomUUID())
                .userId(UUID.randomUUID())
                .tokenType(TokenType.password_reset)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().minus(10, ChronoUnit.MINUTES))  // already expired
                .build();

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.password_reset))
                .thenReturn(Optional.of(expiredToken));

        assertThatThrownBy(() -> passwordResetService.resetPassword(rawToken, "newpass123"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void testResetPassword_alreadyUsedToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        AuthToken usedToken = AuthToken.builder()
                .id(UUID.randomUUID())
                .userId(UUID.randomUUID())
                .tokenType(TokenType.password_reset)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(1, ChronoUnit.HOURS))
                .usedAt(Instant.now().minus(5, ChronoUnit.MINUTES))  // already used
                .build();

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.password_reset))
                .thenReturn(Optional.of(usedToken));

        assertThatThrownBy(() -> passwordResetService.resetPassword(rawToken, "newpass123"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("already been used");
    }

    @Test
    void testResetPassword_unknownToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.password_reset))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> passwordResetService.resetPassword(rawToken, "newpass123"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid");
    }
}
