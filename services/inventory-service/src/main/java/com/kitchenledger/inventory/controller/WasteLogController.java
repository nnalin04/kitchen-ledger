package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.LogWasteRequest;
import com.kitchenledger.inventory.dto.response.WasteLogResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.WasteLogService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/waste-logs")
@RequiredArgsConstructor
public class WasteLogController {

    private final WasteLogService wasteLogService;

    @GetMapping
    public ResponseEntity<Page<WasteLogResponse>> list(HttpServletRequest req,
                                                        @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(
                wasteLogService.list(tenantId(req), pageable)
                        .map(WasteLogResponse::from));
    }

    @GetMapping("/cost-summary")
    public ResponseEntity<Map<String, BigDecimal>> costSummary(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        BigDecimal total = wasteLogService.totalWasteCost(tenantId(req), from, to);
        return ResponseEntity.ok(Map.of("total_waste_cost", total));
    }

    @PostMapping
    @RequiresRole({"owner", "manager", "kitchen_staff", "server"})
    public ResponseEntity<WasteLogResponse> logWaste(HttpServletRequest req,
                                                      @Valid @RequestBody LogWasteRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(WasteLogResponse.from(
                        wasteLogService.logWaste(tenantId(req), userId(req), body)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
