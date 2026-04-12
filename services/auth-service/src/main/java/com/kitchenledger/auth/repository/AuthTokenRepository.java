package com.kitchenledger.auth.repository;

import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.enums.TokenType;
import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.stereotype.Repository;

import java.util.Optional;
import java.util.UUID;

@Repository
public interface AuthTokenRepository extends JpaRepository<AuthToken, UUID> {

    Optional<AuthToken> findByTokenHashAndTokenType(String tokenHash, TokenType tokenType);

    Optional<AuthToken> findByTokenHash(String tokenHash);
}
