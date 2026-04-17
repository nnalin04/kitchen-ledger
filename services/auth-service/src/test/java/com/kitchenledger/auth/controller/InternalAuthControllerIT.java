package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class InternalAuthControllerIT extends AbstractIT {

    // ── POST /internal/auth/verify-token ─────────────────────────────────────

    @Test
    void verifyToken_validJwt_returnsValidTrueWithClaims() throws Exception {
        String email = uniqueEmail("verify-valid");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String accessToken = (String) data.get("accessToken");

        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET)
                        .content(json(Map.of("token", accessToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andExpect(jsonPath("$.payload.user_id").isString())
                .andExpect(jsonPath("$.payload.tenant_id").isString())
                .andExpect(jsonPath("$.payload.role").value("owner"))
                .andExpect(jsonPath("$.payload.jti").isString());
    }

    @Test
    void verifyToken_tamperedJwt_returnsValidFalse() throws Exception {
        String email = uniqueEmail("verify-tampered");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String accessToken = (String) data.get("accessToken");

        // Tamper the signature part
        String[] parts = accessToken.split("\\.");
        String tamperedToken = parts[0] + "." + parts[1] + ".invalidsignature";

        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET)
                        .content(json(Map.of("token", tamperedToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false))
                .andExpect(jsonPath("$.reason").value("invalid_or_expired"));
    }

    @Test
    void verifyToken_totallyBogusToken_returnsValidFalse() throws Exception {
        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET)
                        .content(json(Map.of("token", "this.is.not.a.jwt"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(false));
    }

    @Test
    void verifyToken_missingBody_returns400() throws Exception {
        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET)
                        .content("{}"))
                .andExpect(status().isBadRequest())
                .andExpect(jsonPath("$.valid").value(false));
    }

    @Test
    void verifyToken_wrongInternalSecret_returns403() throws Exception {
        String email = uniqueEmail("verify-no-secret");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String accessToken = (String) data.get("accessToken");

        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", "wrong-secret")
                        .content(json(Map.of("token", accessToken))))
                .andExpect(status().isForbidden());
    }

    @Test
    void verifyToken_missingInternalSecret_returns403() throws Exception {
        String email = uniqueEmail("verify-missing-secret");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String accessToken = (String) data.get("accessToken");

        mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        // no X-Internal-Service-Secret header
                        .content(json(Map.of("token", accessToken))))
                .andExpect(status().isForbidden());
    }

    // ── GET /internal/auth/users/{userId} ─────────────────────────────────────

    @Test
    void getUser_existingId_returnsUserData() throws Exception {
        String email = uniqueEmail("internal-get-user");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String userId = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(get("/internal/auth/users/" + userId)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(userId))
                .andExpect(jsonPath("$.data.email").value(email))
                .andExpect(jsonPath("$.data.role").value("owner"));
    }

    @Test
    void getUser_nonExistentId_returns404() throws Exception {
        mockMvc.perform(get("/internal/auth/users/" + java.util.UUID.randomUUID())
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET))
                .andExpect(status().isNotFound());
    }

    @Test
    void getUser_wrongSecret_returns403() throws Exception {
        String email = uniqueEmail("internal-get-denied");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String userId = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(get("/internal/auth/users/" + userId)
                        .header("X-Internal-Service-Secret", "wrong-secret"))
                .andExpect(status().isForbidden());
    }

    // ── Full round-trip: register → verify token ──────────────────────────────

    @Test
    void fullRoundTrip_registerThenVerifyToken_claimsMatchRegisteredUser() throws Exception {
        String email = uniqueEmail("roundtrip");
        Map<String, Object> authData = registerAndGetData(email, "password123");
        String accessToken = (String) authData.get("accessToken");
        //noinspection unchecked
        String registeredUserId = (String) ((Map<String, Object>) authData.get("user")).get("id");
        //noinspection unchecked
        String registeredTenantId = (String) ((Map<String, Object>) authData.get("tenant")).get("id");

        var verifyResult = mockMvc.perform(post("/internal/auth/verify-token")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("X-Internal-Service-Secret", INTERNAL_SECRET)
                        .content(json(Map.of("token", accessToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.valid").value(true))
                .andReturn();

        //noinspection unchecked
        Map<String, Object> body    = objectMapper.readValue(
                verifyResult.getResponse().getContentAsString(), Map.class);
        //noinspection unchecked
        Map<String, Object> payload = (Map<String, Object>) body.get("payload");

        // Claims must match what was registered
        org.assertj.core.api.Assertions.assertThat(payload.get("user_id")).isEqualTo(registeredUserId);
        org.assertj.core.api.Assertions.assertThat(payload.get("tenant_id")).isEqualTo(registeredTenantId);
        org.assertj.core.api.Assertions.assertThat(payload.get("role")).isEqualTo("owner");
    }
}
