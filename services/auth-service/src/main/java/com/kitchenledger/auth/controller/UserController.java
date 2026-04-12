package com.kitchenledger.auth.controller;

import com.kitchenledger.auth.dto.request.InviteUserRequest;
import com.kitchenledger.auth.dto.request.UpdateUserRequest;
import com.kitchenledger.auth.dto.response.UserResponse;
import com.kitchenledger.auth.security.RequiresRole;
import com.kitchenledger.auth.service.InviteService;
import com.kitchenledger.auth.service.UserService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/auth/users")
@RequiredArgsConstructor
public class UserController {

    private final UserService userService;
    private final InviteService inviteService;

    @GetMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> listUsers(HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        List<UserResponse> users = userService.listByTenant(tenantId);
        return ResponseEntity.ok(Map.of("success", true, "data", users));
    }

    @PostMapping("/invite")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> inviteUser(
            @Valid @RequestBody InviteUserRequest req,
            HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        UserResponse invited = inviteService.inviteUser(tenantId, req);
        return ResponseEntity.ok(Map.of(
                "success", true,
                "user_id", invited.getId()
        ));
    }

    @PostMapping("/accept-invite")
    public ResponseEntity<Map<String, Object>> acceptInvite(
            @RequestBody Map<String, String> body) {
        String token       = body.get("token");
        String newPassword = body.get("password");
        if (token == null || newPassword == null) {
            return ResponseEntity.badRequest()
                    .body(Map.of("success", false,
                            "error", Map.of("code", "VALIDATION_ERROR",
                                    "message", "token and password are required")));
        }
        inviteService.acceptInvite(token, newPassword);
        return ResponseEntity.ok(Map.of("success", true));
    }

    @PatchMapping("/{userId}")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> updateUser(
            @PathVariable UUID userId,
            @Valid @RequestBody UpdateUserRequest req,
            HttpServletRequest request) {
        UUID tenantId = extractTenantId(request);
        UserResponse updated = userService.updateUser(userId, tenantId, req);
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
