package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.response.DashboardKpiResponse;
import com.kitchenledger.finance.model.DailySalesReport;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import com.kitchenledger.finance.repository.VendorPaymentRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.Optional;
import java.util.UUID;

/**
 * Finance dashboard KPI computation service.
 *
 * <p>All figures are best-effort from available data:
 * <ul>
 *   <li>Yesterday's sales — from DSR if present, else zero</li>
 *   <li>7-day rolling food/labor cost % — uses expense category sums against net sales</li>
 *   <li>Pending AP — from VendorPayment table</li>
 * </ul>
 */
@Service
@RequiredArgsConstructor
public class DashboardService {

    private final DailySalesReportRepository dsrRepository;
    private final ExpenseRepository expenseRepository;
    private final VendorPaymentRepository vendorPaymentRepository;

    /** COGS-related expense categories for 7-day food cost % calculation. */
    private static final java.util.List<String> COGS_CATEGORIES = java.util.List.of(
            "cogs", "food", "beverage", "produce", "grocery", "ingredients", "supplies");

    /** Labor-related expense categories. */
    private static final java.util.List<String> LABOR_CATEGORIES = java.util.List.of(
            "labor", "wages", "payroll", "staff");

    @Transactional(readOnly = true)
    public DashboardKpiResponse buildKpis(UUID tenantId) {

        LocalDate today     = LocalDate.now();
        LocalDate yesterday = today.minusDays(1);
        LocalDate lastWeekSameDay = yesterday.minusDays(7);
        LocalDate sevenDaysAgo   = today.minusDays(6); // inclusive 7-day window

        // ── Yesterday's DSR ───────────────────────────────────────────────────
        Optional<DailySalesReport> yesterdayDsr =
                dsrRepository.findByTenantIdAndReportDate(tenantId, yesterday);

        BigDecimal yesterdayNetSales      = yesterdayDsr.map(DailySalesReport::getNetSales)
                .orElse(BigDecimal.ZERO);
        BigDecimal yesterdayCashOverShort = yesterdayDsr.map(DailySalesReport::getCashOverShort)
                .orElse(null);
        int yesterdayGuestCount = yesterdayDsr.map(DailySalesReport::getCoversCount).orElse(0);
        BigDecimal avgCheckSize = yesterdayDsr.map(DailySalesReport::getAverageCheckSize)
                .orElse(BigDecimal.ZERO);

        // ── % change vs same day last week ────────────────────────────────────
        BigDecimal lastWeekNetSales = dsrRepository
                .findByTenantIdAndReportDate(tenantId, lastWeekSameDay)
                .map(DailySalesReport::getNetSales)
                .orElse(BigDecimal.ZERO);

        BigDecimal salesChangePercent = computeChangePercent(yesterdayNetSales, lastWeekNetSales);

        // ── 7-day food / labor cost % ─────────────────────────────────────────
        BigDecimal netSales7d = dsrRepository.sumNetSalesBetween(tenantId, sevenDaysAgo, today);

        BigDecimal cogs7d = COGS_CATEGORIES.stream()
                .map(cat -> expenseRepository.sumAmountByCategoryBetween(
                        tenantId, cat, sevenDaysAgo, today))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal labor7d = LABOR_CATEGORIES.stream()
                .map(cat -> expenseRepository.sumAmountByCategoryBetween(
                        tenantId, cat, sevenDaysAgo, today))
                .reduce(BigDecimal.ZERO, BigDecimal::add);

        BigDecimal foodCostPct7d  = pct(cogs7d,  netSales7d);
        BigDecimal laborCostPct7d = pct(labor7d, netSales7d);

        // ── Pending AP ────────────────────────────────────────────────────────
        long pendingApCount  = vendorPaymentRepository.countUnpaidByTenant(tenantId);
        BigDecimal pendingApTotal = vendorPaymentRepository.sumUnpaidByTenant(tenantId);

        return DashboardKpiResponse.builder()
                .yesterdayNetSales(yesterdayNetSales)
                .yesterdayNetSalesChangePercent(salesChangePercent)
                .yesterdayCashOverShort(yesterdayCashOverShort)
                .foodCostPercent7d(foodCostPct7d)
                .laborCostPercent7d(laborCostPct7d)
                .avgSplh7d(BigDecimal.ZERO)   // placeholder — requires staff-service data
                .yesterdayGuestCount(yesterdayGuestCount)
                .avgCheckSize(avgCheckSize)
                .pendingApCount((int) pendingApCount)
                .pendingApTotal(pendingApTotal)
                .build();
    }

    // ── Math helpers ──────────────────────────────────────────────────────────

    private static BigDecimal pct(BigDecimal numerator, BigDecimal denominator) {
        if (denominator == null || denominator.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return numerator.multiply(new BigDecimal("100"))
                .divide(denominator, 2, RoundingMode.HALF_UP);
    }

    /**
     * Percent change from base to current.
     * Returns ZERO when base is zero (avoids division by zero).
     */
    private static BigDecimal computeChangePercent(BigDecimal current, BigDecimal base) {
        if (base == null || base.compareTo(BigDecimal.ZERO) == 0) {
            return BigDecimal.ZERO.setScale(2, RoundingMode.HALF_UP);
        }
        return current.subtract(base)
                .multiply(new BigDecimal("100"))
                .divide(base, 2, RoundingMode.HALF_UP);
    }
}
