package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import com.kitchenledger.auth.model.AuthToken;
import com.kitchenledger.auth.model.enums.TokenType;
import com.kitchenledger.auth.repository.AuthTokenRepository;
import com.kitchenledger.auth.service.AuthService;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;

import java.time.Instant;
import java.time.temporal.ChronoUnit;
import java.util.Map;
import java.util.UUID;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class UserControllerIT extends AbstractIT {

    @Autowired
    AuthTokenRepository authTokenRepository;

    // ── POST /api/auth/users/invite ───────────────────────────────────────────

    @Test
    void inviteUser_asOwner_createsInactiveUser() throws Exception {
        String ownerEmail = uniqueEmail("invite-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email", uniqueEmail("staff"),
                                "fullName", "Test Staff",
                                "role", "kitchen_staff"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.user_id").isString());
    }

    @Test
    void inviteUser_duplicateEmail_returns409() throws Exception {
        String ownerEmail = uniqueEmail("dup-invite-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String staffEmail = uniqueEmail("dup-staff");

        // First invite
        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email", staffEmail,
                                "fullName", "Staff One",
                                "role", "kitchen_staff"
                        ))))
                .andExpect(status().isOk());

        // Duplicate invite same email → 409
        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email", staffEmail,
                                "fullName", "Staff One Again",
                                "role", "server"
                        ))))
                .andExpect(status().isConflict());
    }

    @Test
    void inviteUser_asKitchenStaff_returns403() throws Exception {
        String ownerEmail = uniqueEmail("staff-invite-attempt");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        // Only owners can invite; role=kitchen_staff → AccessDenied
        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "kitchen_staff") // wrong role
                        .content(json(Map.of(
                                "email", uniqueEmail("blocked-staff"),
                                "fullName", "Blocked",
                                "role", "server"
                        ))))
                .andExpect(status().isForbidden());
    }

    // ── POST /api/auth/users/accept-invite ────────────────────────────────────

    @Test
    void acceptInvite_validToken_activatesUserAccount() throws Exception {
        String ownerEmail = uniqueEmail("accept-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String staffEmail = uniqueEmail("accept-staff");

        // Invite a staff member — captures their user_id from response
        var inviteResult = mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email", staffEmail,
                                "fullName", "New Staff",
                                "role", "server"
                        ))))
                .andExpect(status().isOk())
                .andReturn();

        //noinspection unchecked
        String userId = (String) ((Map<String, Object>) objectMapper
                .readValue(inviteResult.getResponse().getContentAsString(), Map.class))
                .get("user_id");

        // Directly insert a known-token record (raw token never leaves the backend)
        String rawToken   = UUID.randomUUID().toString();
        String tokenHash  = AuthService.sha256Hex(rawToken);
        authTokenRepository.save(AuthToken.builder()
                .userId(UUID.fromString(userId))
                .tokenType(TokenType.invite)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().plus(72, ChronoUnit.HOURS))
                .metadata(Map.of())
                .build());

        // Accept invite
        mockMvc.perform(post("/api/auth/users/accept-invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", rawToken, "password", "newpassword123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true));

        // Verify the user can now log in
        mockMvc.perform(post("/api/auth/login")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("email", staffEmail, "password", "newpassword123"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.user.email").value(staffEmail))
                .andExpect(jsonPath("$.data.user.active").value(true))
                .andExpect(jsonPath("$.data.user.verified").value(true));
    }

    @Test
    void acceptInvite_expiredToken_returns422() throws Exception {
        // Insert an already-expired token with no real user needed → use a fake userId
        // Actually we need a real user_id (FK constraint). Register a user to get an id.
        String ownerEmail = uniqueEmail("expire-accept-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String userId = (String) ((Map<String, Object>) data.get("user")).get("id");

        String rawToken  = UUID.randomUUID().toString();
        String tokenHash = AuthService.sha256Hex(rawToken);
        authTokenRepository.save(AuthToken.builder()
                .userId(UUID.fromString(userId))
                .tokenType(TokenType.invite)
                .tokenHash(tokenHash)
                .expiresAt(Instant.now().minus(1, ChronoUnit.HOURS)) // already expired
                .metadata(Map.of())
                .build());

        mockMvc.perform(post("/api/auth/users/accept-invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of("token", rawToken, "password", "newpass"))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.message").value(containsString("expired")));
    }

    @Test
    void acceptInvite_unknownToken_returns422() throws Exception {
        mockMvc.perform(post("/api/auth/users/accept-invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content(json(Map.of(
                                "token", UUID.randomUUID().toString(),
                                "password", "newpass"
                        ))))
                .andExpect(status().isUnprocessableEntity())
                .andExpect(jsonPath("$.error.message").value(containsString("Invalid")));
    }

    @Test
    void acceptInvite_missingBody_returns400() throws Exception {
        mockMvc.perform(post("/api/auth/users/accept-invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .content("{}"))
                .andExpect(status().isBadRequest());
    }

    // ── GET /api/auth/users ───────────────────────────────────────────────────

    @Test
    void listUsers_asOwner_returnsAllTenantUsers() throws Exception {
        String ownerEmail = uniqueEmail("list-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(get("/api/auth/users")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isArray())
                .andExpect(jsonPath("$.data.length()").value(greaterThanOrEqualTo(1)))
                .andExpect(jsonPath("$.data[0].email").value(ownerEmail));
    }

    @Test
    void listUsers_asManager_isAllowed() throws Exception {
        String ownerEmail = uniqueEmail("list-manager");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        mockMvc.perform(get("/api/auth/users")
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "manager"))
                .andExpect(status().isOk());
    }

    @Test
    void listUsers_asKitchenStaff_returns403() throws Exception {
        String ownerEmail = uniqueEmail("list-staff-denied");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");

        mockMvc.perform(get("/api/auth/users")
                        .header("x-user-id", ((Map<?, ?>) data.get("user")).get("id"))
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "kitchen_staff"))
                .andExpect(status().isForbidden());
    }

    // ── PATCH /api/auth/users/{userId} ────────────────────────────────────────

    @Test
    void updateUser_changeRole_asOwner_updatesRole() throws Exception {
        String ownerEmail = uniqueEmail("update-role-owner");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String ownerId  = (String) ((Map<String, Object>) data.get("user")).get("id");

        // Invite a staff member
        String staffEmail = uniqueEmail("update-role-staff");
        var inviteResult = mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ownerId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email", staffEmail,
                                "fullName", "Staff Member",
                                "role", "kitchen_staff"
                        ))))
                .andReturn();

        //noinspection unchecked
        String staffId = (String) ((Map<String, Object>) objectMapper
                .readValue(inviteResult.getResponse().getContentAsString(), Map.class))
                .get("user_id");

        // Change their role to manager
        mockMvc.perform(patch("/api/auth/users/" + staffId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ownerId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of("role", "manager"))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.role").value("manager"));
    }

    @Test
    void updateUser_asNonOwner_returns403() throws Exception {
        String ownerEmail = uniqueEmail("update-denied");
        Map<String, Object> data = registerAndGetData(ownerEmail, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String ownerId  = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(patch("/api/auth/users/" + ownerId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", ownerId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "manager") // only owner can update users
                        .content(json(Map.of("role", "server"))))
                .andExpect(status().isForbidden());
    }
}
