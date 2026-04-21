package com.kitchenledger.auth.repository;

import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.enums.TokenType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuthTokenRepository extends JpaRepository<AuthToken, UUID> {

    Optional<AuthToken> findByTokenHashAndTokenType(String tokenHash, TokenType tokenType);

    Optional<AuthToken> findByTokenHash(String tokenHash);

    /**
     * Returns the most recently created unused, non-expired invite token for the given user.
     * Used by the internal getInviteLink endpoint so notification-service can fetch
     * the invite URL at email-send time without the raw token being in the event payload.
     */
    Optional<AuthToken> findFirstByUserIdAndTokenTypeAndUsedAtIsNullAndExpiresAtAfterOrderByCreatedAtDesc(
            UUID userId, TokenType tokenType, Instant now);
}
