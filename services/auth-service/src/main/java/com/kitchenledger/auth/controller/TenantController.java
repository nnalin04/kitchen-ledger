package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.dto.response.TenantResponse;
import com.kitchenledger.auth.security.RequiresRole;
import com.kitchenledger.auth.service.TenantService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth/tenant")
@RequiredArgsConstructor
public class TenantController {

    private final TenantService tenantService;

    @PostMapping("/onboarding/complete")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> completeOnboarding(HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        TenantResponse updated = tenantService.completeOnboarding(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", updated));
    }

    @GetMapping("/profile")
    public ResponseEntity<Map<String, Object>> getProfile(HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        TenantResponse tenant = tenantService.getById(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", tenant));
    }

    @PatchMapping("/profile")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> updateProfile(
            @RequestBody Map<String, Object> fields,
            HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        TenantResponse updated = tenantService.updateProfile(tenantId, fields);
        return ResponseEntity.ok(Map.of("success", true, "data", updated));
    }

    @GetMapping("/settings")
    public ResponseEntity<Map<String, Object>> getSettings(HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        Map<String, Object> settings = tenantService.getSettings(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", settings));
    }

    @PatchMapping("/settings")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> updateSettings(
            @RequestBody Map<String, Object> newSettings,
            HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        Map<String, Object> updated = tenantService.updateSettings(tenantId, newSettings);
        return ResponseEntity.ok(Map.of("success", true, "data", updated));
    }

    private UUID extractTenantId(HttpServletRequest request) {
        Object attr = request.getAttribute("kl.tenantId");
        if (attr == null) {
            String header = request.getHeader("x-tenant-id");
            if (header == null) throw new RuntimeException("Missing tenant context");
            return UUID.fromString(header);
        }
        return UUID.fromString(attr.toString());
    }
}
