package com.kitchenledger.auth.service;

import com.kitchenledger.auth.security.PasswordService;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import static org.assertj.core.api.Assertions.*;

class PasswordServiceTest {

    private PasswordService passwordService;

    @BeforeEach
    void setUp() {
        passwordService = new PasswordService();
    }

    @Test
    void hash_returnsBcryptHash() {
        String hash = passwordService.hash("MySecret123!");
        assertThat(hash).isNotBlank();
        assertThat(hash).startsWith("$2a$");
    }

    @Test
    void hash_twoCallsSamePassword_returnsDifferentHashes() {
        // BCrypt uses random salt
        String h1 = passwordService.hash("samePassword");
        String h2 = passwordService.hash("samePassword");
        assertThat(h1).isNotEqualTo(h2);
    }

    @Test
    void matches_correctPassword_returnsTrue() {
        String hash = passwordService.hash("correct-horse-battery-staple");
        assertThat(passwordService.matches("correct-horse-battery-staple", hash)).isTrue();
    }

    @Test
    void matches_wrongPassword_returnsFalse() {
        String hash = passwordService.hash("correct-horse-battery-staple");
        assertThat(passwordService.matches("wrong-password", hash)).isFalse();
    }

    @Test
    void matches_emptyPassword_returnsFalse() {
        String hash = passwordService.hash("some-password");
        assertThat(passwordService.matches("", hash)).isFalse();
    }
}
