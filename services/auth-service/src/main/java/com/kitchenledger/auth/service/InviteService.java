package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.InviteUserRequest;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ConflictException;
import com.kitchenledger.auth.exception.ResourceNotFoundException;
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
import java.util.Map;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class InviteService {

    private final UserRepository userRepository;
    private final AuthTokenRepository authTokenRepository;
    private final AuthEventPublisher eventPublisher;
    private final PasswordService passwordService;

    /**
     * Invite a new user to the tenant. Creates the user account with a placeholder
     * password and generates an invite token. The token is sent to the invited user
     * via email (notification-service consumes auth.user.invited event).
     */
    @Transactional
    public UserResponse inviteUser(UUID tenantId, InviteUserRequest req) {
        // Check email not already in this tenant
        userRepository.findByEmailAndTenantId(req.getEmail(), tenantId).ifPresent(u -> {
            throw new ConflictException("User with this email already exists in this tenant");
        });

        // Create inactive user (cannot log in until invite is accepted)
        User user = User.builder()
                .tenantId(tenantId)
                .email(req.getEmail().toLowerCase())
                // Placeholder — will be set on accept-invite
                .hashedPassword(passwordService.hash(UUID.randomUUID().toString()))
                .fullName(req.getFullName())
                .phone(req.getPhone())
                .role(req.getRole())
                .active(false)
                .verified(false)
                .build();
        user = userRepository.save(user);

        // Generate invite token (opaque UUID, hashed in DB)
        String rawToken = UUID.randomUUID().toString();
        AuthToken authToken = AuthToken.builder()
                .userId(user.getId())
                .tokenType(TokenType.invite)
                .tokenHash(AuthService.sha256Hex(rawToken))
                .expiresAt(Instant.now().plus(72, ChronoUnit.HOURS))
                .metadata(Map.of(
                        "role", req.getRole().name(),
                        "inviter_tenant_id", tenantId.toString()
                ))
                .build();
        authTokenRepository.save(authToken);

        // Publish event → notification-service sends the invite email
        eventPublisher.publishUserInvited(user, rawToken);

        log.info("Invited user {} to tenant {}", req.getEmail(), tenantId);
        return UserResponse.from(user);
    }

    /**
     * Accept an invite: set the user's password and activate the account.
     */
    @Transactional
    public void acceptInvite(String rawToken, String newPassword) {
        String hash = AuthService.sha256Hex(rawToken);
        AuthToken authToken = authTokenRepository
                .findByTokenHashAndTokenType(hash, TokenType.invite)
                .orElseThrow(() -> new ValidationException("Invalid or expired invite token"));

        if (authToken.isExpired() || authToken.isUsed()) {
            throw new ValidationException("Invite token is expired or already used");
        }

        User user = userRepository.findByIdAndDeletedAtIsNull(authToken.getUserId())
                .orElseThrow(() -> new ResourceNotFoundException("User", authToken.getUserId()));

        user.setHashedPassword(passwordService.hash(newPassword));
        user.setActive(true);
        user.setVerified(true);
        userRepository.save(user);

        authToken.setUsedAt(Instant.now());
        authTokenRepository.save(authToken);

        log.info("User {} accepted invite and activated account", user.getEmail());
    }
}
