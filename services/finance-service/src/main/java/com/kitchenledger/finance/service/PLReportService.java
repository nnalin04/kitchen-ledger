package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.response.PLReportResponse;
import com.kitchenledger.finance.dto.response.PLSectionItem;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.UUID;

/**
 * Calculates Profit & Loss reports for a given period.
 *
 * <p>Expense categorisation uses the {@code category} field on the Expense model:
 * <ul>
 *   <li>COGS: categories "cogs", "food", "beverage", "produce", "grocery", "ingredients"</li>
 *   <li>Labor: categories "labor", "wages", "payroll", "staff"</li>
 *   <li>Operating: all remaining expense categories</li>
 * </ul>
 *
 * <p>Benchmark thresholds (industry standard for restaurants):
 * <ul>
 *   <li>Food cost %: good &lt; 32%, warning 32–38%, danger &gt; 38%</li>
 *   <li>Labor cost %: good &lt; 30%, warning 30–35%, danger &gt; 35%</li>
 *   <li>Prime cost %: good &lt; 62%, warning 62–68%, danger &gt; 68%</li>
 *   <li>Net profit %: good &gt; 8%, warning 3–8%, danger &lt; 3%</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class PLReportService {

    // ── Benchmark thresholds ──────────────────────────────────────────────────

    private static final BigDecimal FOOD_COST_GOOD    = new BigDecimal("32.00");
    private static final BigDecimal FOOD_COST_DANGER  = new BigDecimal("38.00");
    private static final BigDecimal LABOR_GOOD        = new BigDecimal("30.00");
    private static final BigDecimal LABOR_DANGER      = new BigDecimal("35.00");
    private static final BigDecimal PRIME_GOOD        = new BigDecimal("62.00");
    private static final BigDecimal PRIME_DANGER      = new BigDecimal("68.00");
    private static final BigDecimal NET_PROFIT_GOOD   = new BigDecimal("8.00");
    private static final BigDecimal NET_PROFIT_WARN   = new BigDecimal("3.00");

    /**
     * Categories that map to COGS for P&L purposes.
     * Lowercase comparison — stored values should be lowercase.
     */
    private static final List<String> COGS_CATEGORIES   = List.of(
            "cogs", "food", "beverage", "produce", "grocery", "ingredients", "supplies");

    /** Categories that map to Labor. */
    private static final List<String> LABOR_CATEGORIES  = List.of(
            "labor", "wages", "payroll", "staff");

    // ── Dependencies ──────────────────────────────────────────────────────────

    private final DailySalesReportRepository dsrRepository;
    private final ExpenseRepository expenseRepository;

    // ── Public API ────────────────────────────────────────────────────────────

    /**
     * Generate a P&L report for the primary period, with optional comparison period.
     *
     * @param tenantId     tenant scope
     * @param start        primary period start (inclusive)
     * @param end          primary period end (inclusive)
     * @param compareStart comparison period start; may be null
     * @param compareEnd   comparison period end; may be null
     * @return PLReportResponse with optional .comparison populated
     */
    @Transactional(readOnly = true)
    public PLReportResponse generate(UUID tenantId,
                                     LocalDate start, LocalDate end,
                                     LocalDate compareStart, LocalDate compareEnd) {
        PLReportResponse primary = computePL(tenantId, start, end);
        if (compareStart != null && compareEnd != null) {
            primary.setComparison(computePL(tenantId, compareStart, compareEnd));
        }
        return primary;
    }

    // ── Core computation ──────────────────────────────────────────────────────

    /**
     * Compute a single-period P&L.
     * All divisions guard against zero net sales to prevent ArithmeticException.
     */
    PLReportResponse computePL(UUID tenantId, LocalDate start, LocalDate end) {

        // ── Revenue ───────────────────────────────────────────────────────────
        BigDecimal netSales   = dsrRepository.sumNetSalesBetween(tenantId, start, end);
        BigDecimal grossSales = dsrRepository.sumGrossSalesBetween(tenantId, start, end);

        // ── Expense totals by functional category ─────────────────────────────
        BigDecimal totalCogs      = sumCogs(tenantId, start, end);
        BigDecimal totalLabor     = sumLabor(tenantId, start, end);
        BigDecimal totalOperating = sumOperating(tenantId, start, end);

        // ── Derived metrics ───────────────────────────────────────────────────
        BigDecimal grossProfit = netSales.subtract(totalCogs);
        BigDecimal primeCost   = totalCogs.add(totalLabor);
        BigDecimal netProfit   = grossProfit.subtract(totalLabor).subtract(totalOperating);

        // ── Percentages ───────────────────────────────────────────────────────
        BigDecimal foodCostPercent   = pct(totalCogs,      netSales);
        BigDecimal laborCostPercent  = pct(totalLabor,     netSales);
        BigDecimal primeCostPercent  = pct(primeCost,      netSales);
        BigDecimal netProfitPercent  = pct(netProfit,      netSales);

        // ── Benchmark statuses ────────────────────────────────────────────────
        String foodCostStatus  = foodCostStatus(foodCostPercent);
        String laborStatus     = laborStatus(laborCostPercent);
        String primeCostStatus = primeCostStatus(primeCostPercent);
        String netProfitStatus = netProfitStatus(netProfitPercent);

        // ── Line-item breakdowns ──────────────────────────────────────────────
        List<Object[]> accountRows = expenseRepository.sumByAccountBetween(tenantId, start, end);
        List<PLSectionItem> cogsItems      = new ArrayList<>();
        List<PLSectionItem> laborItems     = new ArrayList<>();
        List<PLSectionItem> operatingItems = new ArrayList<>();

        for (Object[] row : accountRows) {
            String accountName  = (String)     row[0];
            BigDecimal amount   = (BigDecimal) row[1];
            // Use account name heuristic to bucket into section
            String nameLower = accountName.toLowerCase();
            PLSectionItem item = PLSectionItem.builder()
                    .name(accountName)
                    .amount(amount.setScale(2, RoundingMode.HALF_UP))
                    .percentOfRevenue(pct(amount, netSales))
                    .build();
            if (isCogs(nameLower)) {
                cogsItems.add(item);
            } else if (isLabor(nameLower)) {
                laborItems.add(item);
            } else {
                operatingItems.add(item);
            }
        }

        return PLReportResponse.builder()
                .periodStart(start)
                .periodEnd(end)
                .netSales(netSales.setScale(2, RoundingMode.HALF_UP))
                .grossSales(grossSales.setScale(2, RoundingMode.HALF_UP))
                .totalCogs(totalCogs.setScale(2, RoundingMode.HALF_UP))
                .totalLabor(totalLabor.setScale(2, RoundingMode.HALF_UP))
                .totalOperating(totalOperating.setScale(2, RoundingMode.HALF_UP))
                .grossProfit(grossProfit.setScale(2, RoundingMode.HALF_UP))
                .primeCost(primeCost.setScale(2, RoundingMode.HALF_UP))
                .netProfit(netProfit.setScale(2, RoundingMode.HALF_UP))
                .foodCostPercent(foodCostPercent)
                .laborCostPercent(laborCostPercent)
                .primeCostPercent(primeCostPercent)
                .netProfitPercent(netProfitPercent)
                .foodCostStatus(foodCostStatus)
                .laborStatus(laborStatus)
                .primeCostStatus(primeCostStatus)
                .netProfitStatus(netProfitStatus)
                .cogsItems(cogsItems)
                .laborItems(laborItems)
                .operatingItems(operatingItems)
                .build();
    }

    // ── Category-based expense sums ───────────────────────────────────────────

    private BigDecimal sumCogs(UUID tenantId, LocalDate start, LocalDate end) {
        return COGS_CATEGORIES.stream()
                .map(cat -> expenseRepository.sumAmountByCategoryBetween(tenantId, cat, start, end))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumLabor(UUID tenantId, LocalDate start, LocalDate end) {
        return LABOR_CATEGORIES.stream()
                .map(cat -> expenseRepository.sumAmountByCategoryBetween(tenantId, cat, start, end))
                .reduce(BigDecimal.ZERO, BigDecimal::add);
    }

    private BigDecimal sumOperating(UUID tenantId, LocalDate start, LocalDate end) {
        BigDecimal total = expenseRepository.sumAmountBetween(tenantId, start, end);
        BigDecimal cogs  = sumCogs(tenantId, start, end);
        BigDecimal labor = sumLabor(tenantId, start, end);
        return total.subtract(cogs).subtract(labor).max(BigDecimal.ZERO);
    }

    // ── Math helpers ──────────────────────────────────────────────────────────

    /**
     * Calculate (numerator / denominator) * 100, scale 2, HALF_UP.
     * Returns ZERO when denominator is zero to prevent ArithmeticException.
     */
    private static BigDecimal pct(BigDecimal numerator, BigDecimal denominator) {
        if (denominator == null || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return numerator
                .multiply(new BigDecimal("100"))
                .divide(denominator, 2, RoundingMode.HALF_UP);
    }

    // ── Benchmark status helpers ──────────────────────────────────────────────

    private static String foodCostStatus(BigDecimal pct) {
        if (pct.compareTo(FOOD_COST_GOOD)   < 0) return "GOOD";
        if (pct.compareTo(FOOD_COST_DANGER) < 0) return "WARNING";
        return "DANGER";
    }

    private static String laborStatus(BigDecimal pct) {
        if (pct.compareTo(LABOR_GOOD)   < 0) return "GOOD";
        if (pct.compareTo(LABOR_DANGER) < 0) return "WARNING";
        return "DANGER";
    }

    private static String primeCostStatus(BigDecimal pct) {
        if (pct.compareTo(PRIME_GOOD)   < 0) return "GOOD";
        if (pct.compareTo(PRIME_DANGER) < 0) return "WARNING";
        return "DANGER";
    }

    private static String netProfitStatus(BigDecimal pct) {
        if (pct.compareTo(NET_PROFIT_GOOD) >= 0) return "GOOD";
        if (pct.compareTo(NET_PROFIT_WARN) >= 0) return "WARNING";
        return "DANGER";
    }

    // ── Category name heuristics ──────────────────────────────────────────────

    private static boolean isCogs(String nameLower) {
        return COGS_CATEGORIES.stream().anyMatch(nameLower::contains);
    }

    private static boolean isLabor(String nameLower) {
        return LABOR_CATEGORIES.stream().anyMatch(nameLower::contains);
    }
}
