package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.response.APAgingResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.AccountsPayableService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

/**
 * Accounts-payable endpoints.
 *
 * <p>AP data is sensitive — restricted to owner and manager roles.
 */
@RestController
@RequestMapping("/api/v1/finance/ap")
@RequiredArgsConstructor
public class ApController {

    private final AccountsPayableService apService;

    /**
     * High-level AP summary: total outstanding, total overdue, due-soon, and per-vendor rows.
     *
     * <p>Example: {@code GET /api/v1/finance/ap/summary}
     */
    @GetMapping("/summary")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> summary(HttpServletRequest req) {
        APAgingResponse response = apService.getSummary(tenantId(req));
        return ResponseEntity.ok(Map.of("success", true, "data", response));
    }

    /**
     * Detailed AP aging report — same data as summary but emphasises per-vendor aging buckets.
     *
     * <p>Example: {@code GET /api/v1/finance/ap/aging}
     */
    @GetMapping("/aging")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> aging(HttpServletRequest req) {
        APAgingResponse response = apService.getSummary(tenantId(req));
        return ResponseEntity.ok(Map.of("success", true, "data", response));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
