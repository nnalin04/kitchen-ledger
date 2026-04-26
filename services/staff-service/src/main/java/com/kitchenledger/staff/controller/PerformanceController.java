package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreatePerformanceGoalRequest;
import com.kitchenledger.staff.dto.response.PerformanceGoalResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.PerformanceGoalService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/employees/{employeeId}/goals")
@RequiredArgsConstructor
public class PerformanceController {

    private final PerformanceGoalService goalService;

    @GetMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<List<PerformanceGoalResponse>> list(
            HttpServletRequest req,
            @PathVariable UUID employeeId) {
        List<PerformanceGoalResponse> goals = goalService
                .listByEmployee(tenantId(req), employeeId)
                .stream()
                .map(PerformanceGoalResponse::from)
                .toList();
        return ResponseEntity.ok(goals);
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PerformanceGoalResponse> create(
            HttpServletRequest req,
            @PathVariable UUID employeeId,
            @Valid @RequestBody CreatePerformanceGoalRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(PerformanceGoalResponse.from(
                        goalService.createGoal(tenantId(req), employeeId, userId(req), body)));
    }

    @PatchMapping("/{goalId}/progress")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PerformanceGoalResponse> updateProgress(
            HttpServletRequest req,
            @PathVariable UUID employeeId,
            @PathVariable UUID goalId,
            @RequestBody Map<String, BigDecimal> body) {
        BigDecimal currentValue = body.get("current_value");
        return ResponseEntity.ok(PerformanceGoalResponse.from(
                goalService.updateProgress(tenantId(req), goalId, currentValue)));
    }

    @DeleteMapping("/{goalId}")
    @RequiresRole({"owner"})
    public ResponseEntity<Void> delete(
            HttpServletRequest req,
            @PathVariable UUID employeeId,
            @PathVariable UUID goalId) {
        goalService.softDelete(tenantId(req), goalId);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
