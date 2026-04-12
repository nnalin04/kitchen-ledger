package com.kitchenledger.auth.service;

import com.kitchenledger.auth.dto.request.InviteUserRequest;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.event.AuthEventPublisher;
import com.kitchenledger.auth.exception.ConflictException;
import com.kitchenledger.auth.exception.ValidationException;
import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.TokenType;
import com.kitchenledger.auth.model.enums.UserRole;
import com.kitchenledger.auth.repository.AuthTokenRepository;
import com.kitchenledger.auth.repository.UserRepository;
import com.kitchenledger.auth.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
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
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class InviteServiceTest {

    @Mock UserRepository userRepository;
    @Mock AuthTokenRepository authTokenRepository;
    @Mock AuthEventPublisher eventPublisher;
    @Mock PasswordService passwordService;

    @InjectMocks InviteService inviteService;

    private UUID tenantId;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        when(passwordService.hash(anyString())).thenReturn("$2a$12$placeholder");
    }

    @Test
    void inviteUser_newEmail_createsInactiveUserAndPublishesEvent() {
        InviteUserRequest req = new InviteUserRequest();
        req.setEmail("newstaff@spicegarden.com");
        req.setFullName("New Staff");
        req.setRole(UserRole.kitchen_staff);

        when(userRepository.findByEmailAndTenantId(anyString(), any())).thenReturn(Optional.empty());

        User savedUser = User.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .email("newstaff@spicegarden.com")
                .fullName("New Staff")
                .role(UserRole.kitchen_staff)
                .active(false)
                .build();

        when(userRepository.save(any())).thenReturn(savedUser);
        when(authTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        UserResponse result = inviteService.inviteUser(tenantId, req);

        assertThat(result.isActive()).isFalse();
        assertThat(result.getEmail()).isEqualTo("newstaff@spicegarden.com");

        verify(eventPublisher).publishUserInvited(any(), anyString());
    }

    @Test
    void inviteUser_duplicateEmail_throwsConflictException() {
        InviteUserRequest req = new InviteUserRequest();
        req.setEmail("existing@spicegarden.com");
        req.setFullName("Someone");
        req.setRole(UserRole.server);

        User existing = User.builder().id(UUID.randomUUID()).tenantId(tenantId).build();
        when(userRepository.findByEmailAndTenantId(anyString(), any())).thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> inviteService.inviteUser(tenantId, req))
                .isInstanceOf(ConflictException.class);
    }

    @Test
    void acceptInvite_validToken_activatesUserAndMarksTokenUsed() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        User invitedUser = User.builder()
                .id(UUID.randomUUID())
                .active(false)
                .verified(false)
                .hashedPassword("$2a$12$placeholder")
                .build();

        AuthToken authToken = AuthToken.builder()
                .id(UUID.randomUUID())
                .userId(invitedUser.getId())
                .tokenType(TokenType.invite)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(72, ChronoUnit.HOURS))
                .build();

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.invite))
                .thenReturn(Optional.of(authToken));
        when(userRepository.findByIdAndDeletedAtIsNull(invitedUser.getId()))
                .thenReturn(Optional.of(invitedUser));
        when(passwordService.hash("newpassword123")).thenReturn("$2a$12$newhash");
        when(userRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));
        when(authTokenRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        inviteService.acceptInvite(rawToken, "newpassword123");

        assertThat(invitedUser.isActive()).isTrue();
        assertThat(invitedUser.isVerified()).isTrue();
        assertThat(invitedUser.getHashedPassword()).isEqualTo("$2a$12$newhash");
        assertThat(authToken.getUsedAt()).isNotNull();
    }

    @Test
    void acceptInvite_expiredToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);

        AuthToken expiredToken = AuthToken.builder()
                .tokenHash(tokenHash)
                .tokenType(TokenType.invite)
                .userId(UUID.randomUUID())
                .expiresAt(Instant.now().minus(1, ChronoUnit.HOURS)) // expired
                .build();

        when(authTokenRepository.findByTokenHashAndTokenType(tokenHash, TokenType.invite))
                .thenReturn(Optional.of(expiredToken));

        assertThatThrownBy(() -> inviteService.acceptInvite(rawToken, "password"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("expired");
    }

    @Test
    void acceptInvite_unknownToken_throwsValidationException() {
        String rawToken = UUID.randomUUID().toString();
        when(authTokenRepository.findByTokenHashAndTokenType(anyString(), any()))
                .thenReturn(Optional.empty());

        assertThatThrownBy(() -> inviteService.acceptInvite(rawToken, "password"))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Invalid");
    }
}
