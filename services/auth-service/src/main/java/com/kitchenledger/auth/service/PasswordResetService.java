package com.kitchenledger.auth.service;

import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ValidationException;
import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.TokenType;
import com.kitchenledger.auth.repository.AuthTokenRepository;
import com.kitchenledger.auth.repository.UserRepository;
import com.kitchenledger.auth.security.PasswordService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Optional;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class PasswordResetService {

    private static final int RESET_TOKEN_EXPIRY_HOURS = 1;

    private final UserRepository userRepository;
    private final AuthTokenRepository authTokenRepository;
    private final PasswordService passwordService;
    private final AuthEventPublisher eventPublisher;

    /**
     * Initiates a password reset.  Always returns normally — does NOT reveal whether
     * the email exists in order to prevent user enumeration attacks.
     * Uses global email lookup (multi-tenant: email is unique at the platform level).
     */
    @Transactional
    public void forgotPassword(String email) {
        Optional<User> userOpt = userRepository.findByEmailGlobal(email);
        if (userOpt.isEmpty()) {
            // Silently succeed to prevent user-existence enumeration
            log.debug("Password reset requested for unknown email: {}", email);
            return;
        }
        User user = userOpt.get();

        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        AuthToken resetToken = AuthToken.builder()
                .userId(user.getId())
                .tokenType(TokenType.password_reset)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(RESET_TOKEN_EXPIRY_HOURS, ChronoUnit.HOURS))
                .build();
        authTokenRepository.save(resetToken);

        eventPublisher.publishPasswordResetRequested(user, rawToken);
        log.info("Password reset token issued for user {}", user.getId());
    }

    /**
     * Completes a password reset using a previously issued token.
     *
     * @throws ValidationException if the token is invalid, expired, or already used
     */
    @Transactional
    public void resetPassword(String rawToken, String newPassword) {
        String tokenHash = AuthService.sha256Hex(rawToken);

        AuthToken resetToken = authTokenRepository
                .findByTokenHashAndTokenType(tokenHash, TokenType.password_reset)
                .orElseThrow(() -> new ValidationException("Invalid or unknown reset token"));

        if (resetToken.isUsed()) {
            throw new ValidationException("Reset token has already been used");
        }
        if (resetToken.isExpired()) {
            throw new ValidationException("Reset token has expired");
        }

        User user = userRepository.findByIdAndDeletedAtIsNull(resetToken.getUserId())
                .orElseThrow(() -> new ValidationException("User not found"));

        user.setHashedPassword(passwordService.hash(newPassword));
        userRepository.save(user);

        resetToken.setUsedAt(Instant.now());
        authTokenRepository.save(resetToken);

        log.info("Password reset completed for user {}", user.getId());
    }
}
