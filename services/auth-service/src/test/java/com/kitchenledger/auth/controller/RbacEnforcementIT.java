package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

/**
 * Verifies that RBAC annotations are enforced correctly on UserController endpoints.
 * Tests send gateway-injected x-user-role headers to simulate different roles.
 */
class RbacEnforcementIT extends AbstractIT {

    // ── kitchen_staff is forbidden from user management ──────────────────────

    @Test
    void testKitchenStaff_cannotInviteUsers_returns403() throws Exception {
        Map<String, Object> data = registerAndGetData(uniqueEmail("ks-invite"), "password123");
        String tenantId = getTenantId(data);
        String userId   = getUserId(data);

        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id",   userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "kitchen_staff")
                        .content(json(Map.of(
                                "email",    uniqueEmail("new-staff"),
                                "fullName", "New Staff",
                                "role",     "server"
                        ))))
                .andExpect(status().isForbidden());
    }

    @Test
    void testKitchenStaff_cannotDeactivateUser_returns403() throws Exception {
        Map<String, Object> data = registerAndGetData(uniqueEmail("ks-deact"), "password123");
        String tenantId = getTenantId(data);
        String userId   = getUserId(data);

        mockMvc.perform(patch("/api/auth/users/" + userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id",   userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "kitchen_staff")
                        .content(json(Map.of("active", false))))
                .andExpect(status().isForbidden());
    }

    // ── manager cannot change a user's role ───────────────────────────────────

    @Test
    void testManager_cannotChangeUserRole_returns403() throws Exception {
        Map<String, Object> data = registerAndGetData(uniqueEmail("mgr-role"), "password123");
        String tenantId = getTenantId(data);
        String userId   = getUserId(data);

        // PATCH /{userId} is @RequiresRole({"owner"}) only
        mockMvc.perform(patch("/api/auth/users/" + userId)
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id",   userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "manager")
                        .content(json(Map.of("role", "server"))))
                .andExpect(status().isForbidden());
    }

    // ── owner can perform user management ────────────────────────────────────

    @Test
    void testOwner_canInviteUser_returns200() throws Exception {
        Map<String, Object> data = registerAndGetData(uniqueEmail("owner-invite"), "password123");
        String tenantId = getTenantId(data);
        String userId   = getUserId(data);

        mockMvc.perform(post("/api/auth/users/invite")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id",   userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "email",    uniqueEmail("staff-ok"),
                                "fullName", "Good Staff",
                                "role",     "kitchen_staff"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.user_id").isString());
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    @SuppressWarnings("unchecked")
    private String getTenantId(Map<String, Object> data) {
        return (String) ((Map<String, Object>) data.get("tenant")).get("id");
    }

    @SuppressWarnings("unchecked")
    private String getUserId(Map<String, Object> data) {
        return (String) ((Map<String, Object>) data.get("user")).get("id");
    }
}
