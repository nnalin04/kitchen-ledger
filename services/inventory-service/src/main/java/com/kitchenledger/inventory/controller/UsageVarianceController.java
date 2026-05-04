package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.UsageVarianceRequest;
import com.kitchenledger.inventory.dto.response.UsageVarianceResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.service.UsageVarianceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/usage-variance")
@RequiredArgsConstructor
public class UsageVarianceController {

    private final UsageVarianceService usageVarianceService;

    @PostMapping
    public ResponseEntity<UsageVarianceResponse> logVariance(
            HttpServletRequest req,
            @Valid @RequestBody UsageVarianceRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(usageVarianceService.logVariance(tenantId(req), userId(req), body));
    }

    @GetMapping("/report")
    public ResponseEntity<List<Map<String, Object>>> getReport(
            HttpServletRequest req,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateFrom,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate dateTo,
            @RequestParam(required = false) UUID recipeId) {
        return ResponseEntity.ok(
                usageVarianceService.getReport(tenantId(req), dateFrom, dateTo, recipeId));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
