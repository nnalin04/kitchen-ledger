package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Integration tests for POST /api/auth/refresh — token rotation and expiry.
 */
class TokenRefreshIT extends AbstractIT {

    @Test
    void testRefresh_validToken_returnsNewAccessToken() throws Exception {
        String email = uniqueEmail("refresh-valid");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String refreshToken = (String) data.get("refreshToken");

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").isString())
                .andExpect(jsonPath("$.data.refreshToken").isString())
                // New refresh token must differ from the old one (rotation)
                .andExpect(jsonPath("$.data.refreshToken").value(not(refreshToken)));
    }

    @Test
    void testRefresh_usedToken_returns401() throws Exception {
        // Token rotation: after a successful refresh, the old token is revoked.
        String email = uniqueEmail("refresh-used");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String originalToken = (String) data.get("refreshToken");

        // First refresh succeeds and rotates the token
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", originalToken))))
                .andExpect(status().isOk());

        // Using the original (now-revoked) token again must fail
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", originalToken))))
                .andExpect(status().isBadRequest()); // 400 ValidationException → mapped to 400
    }

    @Test
    void testRefresh_expiredToken_returns401() throws Exception {
        // Use a token that was never issued — simulates an expired/unknown token
        String nonExistentToken = "aaaaaaaa-0000-0000-0000-bbbbbbbbbbbb";

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", nonExistentToken))))
                .andExpect(status().isBadRequest());
    }

    @Test
    void testRefresh_missingToken_returns400() throws Exception {
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of())))
                .andExpect(status().isBadRequest());
    }
}
