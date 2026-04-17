package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class AuthControllerIT extends AbstractIT {

    // ── POST /api/auth/register ───────────────────────────────────────────────

    @Test
    void register_success_returns201WithTokens() throws Exception {
        String email = uniqueEmail("register");

        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "restaurantName", "Spice Garden",
                                "email", email,
                                "password", "password123",
                                "fullName", "Ravi Kumar"
                        ))))
                .andExpect(status().isCreated())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").isString())
                .andExpect(jsonPath("$.data.refreshToken").isString())
                .andExpect(jsonPath("$.data.expiresIn").isNumber())
                .andExpect(jsonPath("$.data.user.email").value(email))
                .andExpect(jsonPath("$.data.user.role").value("owner"))
                .andExpect(jsonPath("$.data.user.active").value(true))
                .andExpect(jsonPath("$.data.tenant.restaurantName").value("Spice Garden"));
    }

    @Test
    void register_duplicateEmail_returns409() throws Exception {
        String email = uniqueEmail("dup-register");

        // First registration
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "restaurantName", "First Place",
                                "email", email,
                                "password", "password123",
                                "fullName", "Owner One"
                        ))))
                .andExpect(status().isCreated());

        // Duplicate
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "restaurantName", "Second Place",
                                "email", email,
                                "password", "otherpass",
                                "fullName", "Owner Two"
                        ))))
                .andExpect(status().isConflict())
                .andExpect(jsonPath("$.error.code").value("CONFLICT"));
    }

    @Test
    void register_missingRequiredFields_returns400() throws Exception {
        mockMvc.perform(post("/api/auth/register")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "restaurantName", "No Email Place"
                                // missing email, password, fullName
                        ))))
                .andExpect(status().isBadRequest());
    }

    // ── POST /api/auth/login ──────────────────────────────────────────────────

    @Test
    void login_correctCredentials_returns200WithTokens() throws Exception {
        String email = uniqueEmail("login");
        registerAndGetData(email, "secret123");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "secret123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.accessToken").isString())
                .andExpect(jsonPath("$.data.refreshToken").isString())
                .andExpect(jsonPath("$.data.user.email").value(email));
    }

    @Test
    void login_wrongPassword_returns422() throws Exception {
        String email = uniqueEmail("wrong-pass");
        registerAndGetData(email, "correct-password");

        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", email, "password", "wrong-password"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.message").value(containsString("Invalid email or password")));
    }

    @Test
    void login_unknownEmail_returns422() throws Exception {
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "email", "nobody-" + java.util.UUID.randomUUID() + "@nowhere.com",
                                "password", "password"
                        ))))
                .andExpect(status().isUnprocessableEntity());
    }

    // ── GET /api/auth/me ──────────────────────────────────────────────────────

    @Test
    void getMe_withGatewayHeaders_returnsCurrentUser() throws Exception {
        String email = uniqueEmail("getme");
        Map<String, Object> data = registerAndGetData(email, "password123");

        //noinspection unchecked
        Map<String, Object> user = (Map<String, Object>) data.get("user");
        String userId   = (String) user.get("id");
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        mockMvc.perform(get("/api/auth/me")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.email").value(email))
                .andExpect(jsonPath("$.data.role").value("owner"));
    }

    @Test
    void getMe_withoutHeaders_throws500() throws Exception {
        // No gateway headers → controller throws RuntimeException("Missing user context")
        mockMvc.perform(get("/api/auth/me"))
                .andExpect(status().is5xxServerError());
    }

    // ── PATCH /api/auth/me ────────────────────────────────────────────────────

    @Test
    void updateMe_patchesFullName() throws Exception {
        String email = uniqueEmail("updateme");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        Map<String, Object> user = (Map<String, Object>) data.get("user");
        String userId   = (String) user.get("id");
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        mockMvc.perform(patch("/api/auth/me")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of("fullName", "Updated Name"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.fullName").value("Updated Name"))
                .andExpect(jsonPath("$.data.email").value(email)); // unchanged
    }

    // ── POST /api/auth/refresh ────────────────────────────────────────────────

    @Test
    void refresh_withValidToken_returnsNewAccessToken() throws Exception {
        String email = uniqueEmail("refresh");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String refreshToken = (String) data.get("refreshToken");

        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.accessToken").isString())
                .andExpect(jsonPath("$.data.refreshToken").isString())
                // new refresh token is rotated
                .andExpect(jsonPath("$.data.refreshToken").value(not(equalTo(refreshToken))));
    }

    @Test
    void refresh_withUsedToken_returns422() throws Exception {
        String email = uniqueEmail("used-refresh");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String refreshToken = (String) data.get("refreshToken");

        // Use the token once (rotates it)
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isOk());

        // Try to use the OLD token again → should fail
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.message").value(containsString("expired or revoked")));
    }

    @Test
    void refresh_withBogusToken_returns422() throws Exception {
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", java.util.UUID.randomUUID().toString()))))
                .andExpect(status().isUnprocessableEntity());
    }

    // ── POST /api/auth/logout ─────────────────────────────────────────────────

    @Test
    void logout_revokesRefreshToken() throws Exception {
        String email = uniqueEmail("logout");
        Map<String, Object> data = registerAndGetData(email, "password123");
        String refreshToken = (String) data.get("refreshToken");

        // Logout
        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Refresh should fail now
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isUnprocessableEntity());
    }

    @Test
    void logout_withUnknownToken_returnsOkSilently() throws Exception {
        mockMvc.perform(post("/api/auth/logout")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", java.util.UUID.randomUUID().toString()))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));
    }

    // ── POST /api/auth/me/change-password ─────────────────────────────────────

    @Test
    void changePassword_correctCurrent_updatesAndRevokesTokens() throws Exception {
        String email = uniqueEmail("changepw");
        Map<String, Object> data = registerAndGetData(email, "oldpassword");
        //noinspection unchecked
        Map<String, Object> user = (Map<String, Object>) data.get("user");
        String userId       = (String) user.get("id");
        String refreshToken = (String) data.get("refreshToken");

        // Change password
        mockMvc.perform(post("/api/auth/me/change-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "currentPassword", "oldpassword",
                                "newPassword", "newpassword456"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Old refresh token is revoked
        mockMvc.perform(post("/api/auth/refresh")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("refreshToken", refreshToken))))
                .andExpect(status().isUnprocessableEntity());

        // Can log in with new password
        Map<String, Object> newLogin = loginAndGetData(email, "newpassword456");
        assertThat(newLogin.get("accessToken")).isNotNull();
    }

    @Test
    void changePassword_wrongCurrent_returns422() throws Exception {
        String email = uniqueEmail("wrongcurrent");
        Map<String, Object> data = registerAndGetData(email, "realpassword");
        //noinspection unchecked
        String userId = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(post("/api/auth/me/change-password")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "currentPassword", "wrongpassword",
                                "newPassword", "newpassword456"
                        ))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.message").value(containsString("incorrect")));
    }
}
