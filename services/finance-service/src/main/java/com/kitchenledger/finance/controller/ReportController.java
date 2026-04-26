package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.response.PLReportResponse;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.PLReportService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Finance reporting endpoints.
 *
 * <p>All routes require valid gateway headers (X-Tenant-Id, X-User-Id).
 * Role restrictions are enforced via {@link RequiresRole} and {@link com.kitchenledger.finance.security.RoleCheckAspect}.
 */
@RestController
@RequestMapping("/api/v1/finance/reports")
@RequiredArgsConstructor
public class ReportController {

    private final PLReportService plReportService;
    private final DailySalesReportRepository dsrRepository;
    private final ExpenseRepository expenseRepository;

    /**
     * Profit & Loss report for the given period.
     * Optionally supply compare_start / compare_end to get a side-by-side comparison.
     *
     * <p>Example: {@code GET /api/v1/finance/reports/pl?start=2026-04-01&end=2026-04-30}
     */
    @GetMapping("/pl")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> pl(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end,
            @RequestParam(name = "compare_start", required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate compareStart,
            @RequestParam(name = "compare_end", required = false)
                @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate compareEnd) {

        UUID tenantId = tenantId(req);
        PLReportResponse report = plReportService.generate(tenantId, start, end, compareStart, compareEnd);
        return ResponseEntity.ok(Map.of("success", true, "data", report));
    }

    /**
     * Expense summary by category for a date range.
     *
     * <p>Returns total expenses per category to support the expense breakdown view.
     * Example: {@code GET /api/v1/finance/reports/expenses?start=2026-04-01&end=2026-04-30}
     */
    @GetMapping("/expenses")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> expenseSummary(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {

        UUID tenantId = tenantId(req);
        BigDecimal totalExpenses = expenseRepository.sumAmountBetween(tenantId, start, end);
        java.util.List<Object[]> breakdown = expenseRepository.sumByAccountBetween(tenantId, start, end);

        java.util.List<Map<String, Object>> items = breakdown.stream()
                .map(row -> Map.<String, Object>of(
                        "account", row[0],
                        "total",   row[1]))
                .toList();

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", Map.of(
                        "period_start",     start,
                        "period_end",       end,
                        "total_expenses",   totalExpenses,
                        "by_account",       items)));
    }

    /**
     * Rolling 30-day cash-flow projection.
     * Revenue side: net sales from last 30 DSRs.
     * Cost side: total expenses in same window.
     * Projected next 7 days uses simple 7-day rolling average.
     *
     * <p>Example: {@code GET /api/v1/finance/reports/cash-flow}
     */
    @GetMapping("/cash-flow")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> cashFlow(HttpServletRequest req) {

        UUID tenantId = tenantId(req);
        LocalDate today    = LocalDate.now();
        LocalDate from30   = today.minusDays(29);

        BigDecimal netSales30d = dsrRepository.sumNetSalesBetween(tenantId, from30, today);
        BigDecimal expenses30d = expenseRepository.sumAmountBetween(tenantId, from30, today);
        BigDecimal netCashFlow = netSales30d.subtract(expenses30d);

        // Simple 7-day rolling average for projection
        LocalDate from7 = today.minusDays(6);
        BigDecimal netSales7d   = dsrRepository.sumNetSalesBetween(tenantId, from7, today);
        BigDecimal expenses7d   = expenseRepository.sumAmountBetween(tenantId, from7, today);
        BigDecimal dailyAvgNet  = netSales7d.divide(java.math.BigDecimal.valueOf(7), 2,
                java.math.RoundingMode.HALF_UP);
        BigDecimal dailyAvgExp  = expenses7d.divide(java.math.BigDecimal.valueOf(7), 2,
                java.math.RoundingMode.HALF_UP);
        BigDecimal projectedNext7dRevenue = dailyAvgNet.multiply(java.math.BigDecimal.valueOf(7));
        BigDecimal projectedNext7dExpense = dailyAvgExp.multiply(java.math.BigDecimal.valueOf(7));

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", Map.of(
                        "period_start",           from30,
                        "period_end",             today,
                        "net_sales_30d",          netSales30d,
                        "expenses_30d",           expenses30d,
                        "net_cash_flow_30d",      netCashFlow,
                        "projected_revenue_7d",   projectedNext7dRevenue,
                        "projected_expense_7d",   projectedNext7dExpense,
                        "projected_net_7d",       projectedNext7dRevenue.subtract(projectedNext7dExpense))));
    }

    /**
     * Tax collected summary (VAT + service charge from DSRs) for filing purposes.
     *
     * <p>Example: {@code GET /api/v1/finance/reports/tax?start=2026-04-01&end=2026-04-30}
     */
    @GetMapping("/tax")
    @RequiresRole({"owner"})
    public ResponseEntity<Map<String, Object>> taxSummary(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate start,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate end) {

        UUID tenantId = tenantId(req);
        BigDecimal vatCollected = dsrRepository.sumVatCollectedBetween(tenantId, start, end);

        return ResponseEntity.ok(Map.of(
                "success", true,
                "data", Map.of(
                        "period_start",   start,
                        "period_end",     end,
                        "vat_collected",  vatCollected)));
    }

    // ── Helpers ───────────────────────────────────────────────────────────────

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
