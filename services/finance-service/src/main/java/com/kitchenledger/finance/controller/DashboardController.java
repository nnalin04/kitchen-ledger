package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.response.DashboardKpiResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.DashboardService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import java.util.Map;
import java.util.UUID;

/**
 * Finance dashboard endpoint.
 *
 * <p>Provides the KPI snapshot for the home-screen finance widget:
 * yesterday's sales (vs prior week), 7-day rolling cost percentages,
 * and pending accounts-payable totals.
 *
 * <p>Route: {@code GET /api/v1/finance/dashboard}
 */
@RestController
@RequestMapping("/api/v1/finance/dashboard")
@RequiredArgsConstructor
public class DashboardController {

    private final DashboardService dashboardService;

    /**
     * Returns the finance KPI snapshot for the authenticated tenant.
     *
     * <p>Example: {@code GET /api/v1/finance/dashboard}
     */
    @GetMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> dashboard(HttpServletRequest req) {
        DashboardKpiResponse kpis = dashboardService.buildKpis(tenantId(req));
        return ResponseEntity.ok(Map.of("success", true, "data", kpis));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
