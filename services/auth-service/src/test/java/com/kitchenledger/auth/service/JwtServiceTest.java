package com.kitchenledger.auth.service;

import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.UserRole;
import com.kitchenledger.auth.security.JwtService;
import com.kitchenledger.auth.util.TestKeyPairFactory;
import io.jsonwebtoken.Claims;
import io.jsonwebtoken.JwtException;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.test.util.ReflectionTestUtils;

import java.util.UUID;

import static org.assertj.core.api.Assertions.*;

class JwtServiceTest {

    private JwtService jwtService;
    private User testUser;

    @BeforeEach
    void setUp() {
        jwtService = new JwtService(TestKeyPairFactory.privateKey(), TestKeyPairFactory.publicKey());
        ReflectionTestUtils.setField(jwtService, "accessTokenExpiryMinutes", 15L);

        testUser = User.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .email("chef@spicegarden.com")
                .role(UserRole.owner)
                .build();
    }

    @Test
    void generateAccessToken_returnsValidToken() {
        String token = jwtService.generateAccessToken(testUser);
        assertThat(token).isNotBlank();
    }

    @Test
    void validateToken_parsesClaimsCorrectly() {
        String token = jwtService.generateAccessToken(testUser);
        Claims claims = jwtService.validateToken(token);

        assertThat(claims.getSubject()).isEqualTo(testUser.getId().toString());
        assertThat(claims.get("tenant_id", String.class)).isEqualTo(testUser.getTenantId().toString());
        assertThat(claims.get("role", String.class)).isEqualTo("owner");
        assertThat(claims.get("email", String.class)).isEqualTo(testUser.getEmail());
        assertThat(claims.getId()).isNotBlank(); // jti present
    }

    @Test
    void validateToken_throwsOnTamperedToken() {
        String token = jwtService.generateAccessToken(testUser);
        String tampered = token.substring(0, token.length() - 4) + "XXXX";
        assertThatThrownBy(() -> jwtService.validateToken(tampered))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void validateToken_throwsOnTokenSignedWithDifferentKey() throws Exception {
        // Generate a second key pair
        java.security.KeyPairGenerator kpg = java.security.KeyPairGenerator.getInstance("RSA");
        kpg.initialize(2048);
        java.security.KeyPair otherPair = kpg.generateKeyPair();
        JwtService otherService = new JwtService(
                (java.security.interfaces.RSAPrivateKey) otherPair.getPrivate(),
                (java.security.interfaces.RSAPublicKey) otherPair.getPublic()
        );
        ReflectionTestUtils.setField(otherService, "accessTokenExpiryMinutes", 15L);

        String foreignToken = otherService.generateAccessToken(testUser);
        assertThatThrownBy(() -> jwtService.validateToken(foreignToken))
                .isInstanceOf(JwtException.class);
    }

    @Test
    void generateRefreshToken_returnsOpaqueUuidString() {
        String rt = jwtService.generateRefreshToken();
        assertThat(rt).isNotBlank();
        // Must be parseable as a UUID
        assertThatCode(() -> UUID.fromString(rt)).doesNotThrowAnyException();
    }

    @Test
    void twoRefreshTokenCalls_returnDistinctValues() {
        String rt1 = jwtService.generateRefreshToken();
        String rt2 = jwtService.generateRefreshToken();
        assertThat(rt1).isNotEqualTo(rt2);
    }
}
