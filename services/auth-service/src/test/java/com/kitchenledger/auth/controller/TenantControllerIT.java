package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.AbstractIT;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;

import java.util.Map;

import static org.hamcrest.Matchers.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

class TenantControllerIT extends AbstractIT {

    // ── GET /api/auth/tenant/profile ──────────────────────────────────────────

    @Test
    void getProfile_returnsTenantInfo() throws Exception {
        String email = uniqueEmail("profile-get");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(get("/api/auth/tenant/profile")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data.id").value(tenantId))
                .andExpect(jsonPath("$.data.restaurantName").value("Test Restaurant"))
                .andExpect(jsonPath("$.data.email").value(email));
    }

    // ── PATCH /api/auth/tenant/profile ────────────────────────────────────────

    @Test
    void updateProfile_asOwner_updatesRestaurantName() throws Exception {
        String email = uniqueEmail("profile-update");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(patch("/api/auth/tenant/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "restaurantName", "Spice Garden Premium",
                                "city", "Mumbai"
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.restaurantName").value("Spice Garden Premium"));
    }

    @Test
    void updateProfile_asKitchenStaff_returns403() throws Exception {
        String email = uniqueEmail("profile-denied");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(patch("/api/auth/tenant/profile")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "kitchen_staff")
                        .content(json(Map.of("restaurantName", "Hacked Name"))))
                .andExpect(status().isForbidden());
    }

    // ── GET /api/auth/tenant/settings ─────────────────────────────────────────

    @Test
    void getSettings_returnsSettingsMap() throws Exception {
        String email = uniqueEmail("settings-get");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(get("/api/auth/tenant/settings")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.success").value(true))
                .andExpect(jsonPath("$.data").isMap());
    }

    // ── PATCH /api/auth/tenant/settings ───────────────────────────────────────

    @Test
    void updateSettings_mergesWithExisting() throws Exception {
        String email = uniqueEmail("settings-update");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        // Update settings
        mockMvc.perform(patch("/api/auth/tenant/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of(
                                "default_tax_rate", 18,
                                "enable_upi", true
                        ))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.default_tax_rate").value(18))
                .andExpect(jsonPath("$.data.enable_upi").value(true));

        // Merge: patch with another key; previous keys should still be there
        mockMvc.perform(patch("/api/auth/tenant/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner")
                        .content(json(Map.of("enable_card_payments", false))))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.default_tax_rate").value(18))        // still present
                .andExpect(jsonPath("$.data.enable_upi").value(true))            // still present
                .andExpect(jsonPath("$.data.enable_card_payments").value(false)); // newly added
    }

    @Test
    void updateSettings_asKitchenStaff_returns403() throws Exception {
        String email = uniqueEmail("settings-denied");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(patch("/api/auth/tenant/settings")
                        .contentType(MediaType.APPLICATION_JSON)
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "server")
                        .content(json(Map.of("default_tax_rate", 0))))
                .andExpect(status().isForbidden());
    }

    // ── POST /api/auth/tenant/onboarding/complete ─────────────────────────────

    @Test
    void completeOnboarding_asOwner_setsOnboardingDone() throws Exception {
        String email = uniqueEmail("onboarding");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(post("/api/auth/tenant/onboarding/complete")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.onboardingDone").value(true));

        // Verify profile reflects the change
        mockMvc.perform(get("/api/auth/tenant/profile")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "owner"))
                .andExpect(status().isOk())
                .andExpect(jsonPath("$.data.onboardingDone").value(true));
    }

    @Test
    void completeOnboarding_asManager_returns403() throws Exception {
        String email = uniqueEmail("onboarding-denied");
        Map<String, Object> data = registerAndGetData(email, "password123");
        //noinspection unchecked
        String tenantId = (String) ((Map<String, Object>) data.get("tenant")).get("id");
        String userId   = (String) ((Map<String, Object>) data.get("user")).get("id");

        mockMvc.perform(post("/api/auth/tenant/onboarding/complete")
                        .header("x-user-id", userId)
                        .header("x-tenant-id", tenantId)
                        .header("x-user-role", "manager"))
                .andExpect(status().isForbidden());
    }
}
