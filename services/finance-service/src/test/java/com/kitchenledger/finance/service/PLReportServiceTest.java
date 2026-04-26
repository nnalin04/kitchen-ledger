package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.response.PLReportResponse;
import com.kitchenledger.finance.repository.DailySalesReportRepository;
import com.kitchenledger.finance.repository.ExpenseRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.when;
import static org.mockito.AdditionalMatchers.not;

/**
 * Unit tests for {@link PLReportService}.
 *
 * Scenario: 7 days, net sales = ₹10,000/day = ₹70,000 total
 * COGS  (category "food")  = ₹3,000/day = ₹21,000  → foodCostPercent = 30%  → GOOD
 * Labor (category "labor") = ₹2,500/day = ₹17,500  → laborCostPercent = 25% → GOOD
 * Operating = 0
 * primeCost    = 38,500  → primeCostPercent = 55%  → GOOD
 * grossProfit  = 49,000
 * netProfit    = 31,500  → netProfitPercent  = 45%  → GOOD
 */
@ExtendWith(MockitoExtension.class)
class PLReportServiceTest {

    @Mock private DailySalesReportRepository dsrRepository;
    @Mock private ExpenseRepository expenseRepository;

    @InjectMocks
    private PLReportService plReportService;

    private final UUID tenantId = UUID.randomUUID();

    // ── Helpers ────────────────────────────────────────────────────────────────

    private static final LocalDate START = LocalDate.of(2026, 4, 1);
    private static final LocalDate END   = LocalDate.of(2026, 4, 7);

    /** Stub all DSR and expense repo calls for the standard 7-day scenario. */
    private void stubStandard7Day() {
        BigDecimal netSales    = new BigDecimal("70000.00"); // 10,000 * 7
        BigDecimal grossSales  = new BigDecimal("75000.00");
        BigDecimal cogsTotal   = new BigDecimal("21000.00"); // food
        BigDecimal laborTotal  = new BigDecimal("17500.00"); // labor
        BigDecimal totalExpenses = cogsTotal.add(laborTotal); // no other categories

        when(dsrRepository.sumNetSalesBetween(eq(tenantId), any(), any()))
                .thenReturn(netSales);
        when(dsrRepository.sumGrossSalesBetween(eq(tenantId), any(), any()))
                .thenReturn(grossSales);

        // sumAmountBetween (total) = cogs + labor + 0 operating
        when(expenseRepository.sumAmountBetween(eq(tenantId), any(), any()))
                .thenReturn(totalExpenses);

        // COGS categories: only "food" has a balance, rest return 0
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("food"), any(), any()))
                .thenReturn(cogsTotal);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("cogs"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("beverage"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("produce"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("grocery"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("ingredients"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("supplies"), any(), any()))
                .thenReturn(BigDecimal.ZERO);

        // Labor categories
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("labor"), any(), any()))
                .thenReturn(laborTotal);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("wages"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("payroll"), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(eq(tenantId), eq("staff"), any(), any()))
                .thenReturn(BigDecimal.ZERO);

        when(expenseRepository.sumByAccountBetween(eq(tenantId), any(), any()))
                .thenReturn(List.of());
    }

    // ── Standard scenario ─────────────────────────────────────────────────────

    @Test
    void standardScenario_correctTotalsAndPercentages() {
        stubStandard7Day();

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        assertThat(pl.getNetSales()).isEqualByComparingTo("70000.00");
        assertThat(pl.getTotalCogs()).isEqualByComparingTo("21000.00");
        assertThat(pl.getTotalLabor()).isEqualByComparingTo("17500.00");
        assertThat(pl.getTotalOperating()).isEqualByComparingTo("0.00");
        assertThat(pl.getGrossProfit()).isEqualByComparingTo("49000.00");
        assertThat(pl.getPrimeCost()).isEqualByComparingTo("38500.00");
        assertThat(pl.getNetProfit()).isEqualByComparingTo("31500.00");
    }

    @Test
    void standardScenario_foodCostPercent30_statusGood() {
        stubStandard7Day();

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        // 21000 / 70000 * 100 = 30.00%
        assertThat(pl.getFoodCostPercent()).isEqualByComparingTo("30.00");
        assertThat(pl.getFoodCostStatus()).isEqualTo("GOOD");
    }

    @Test
    void standardScenario_laborCostPercent25_statusGood() {
        stubStandard7Day();

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        // 17500 / 70000 * 100 = 25.00%
        assertThat(pl.getLaborCostPercent()).isEqualByComparingTo("25.00");
        assertThat(pl.getLaborStatus()).isEqualTo("GOOD");
    }

    @Test
    void standardScenario_primeCostPercent55_statusGood() {
        stubStandard7Day();

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        // 38500 / 70000 * 100 = 55.00%
        assertThat(pl.getPrimeCostPercent()).isEqualByComparingTo("55.00");
        assertThat(pl.getPrimeCostStatus()).isEqualTo("GOOD");
    }

    @Test
    void standardScenario_netProfitPercent45_statusGood() {
        stubStandard7Day();

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        // 31500 / 70000 * 100 = 45.00%
        assertThat(pl.getNetProfitPercent()).isEqualByComparingTo("45.00");
        assertThat(pl.getNetProfitStatus()).isEqualTo("GOOD");
    }

    // ── Zero net sales — no division by zero ──────────────────────────────────

    @Test
    void zeroNetSales_returnsZeroPercentages_noException() {
        when(dsrRepository.sumNetSalesBetween(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(dsrRepository.sumGrossSalesBetween(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountBetween(any(), any(), any())).thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumAmountByCategoryBetween(any(), any(), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumByAccountBetween(any(), any(), any())).thenReturn(List.of());

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        assertThat(pl.getNetSales()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(pl.getFoodCostPercent()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(pl.getLaborCostPercent()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(pl.getPrimeCostPercent()).isEqualByComparingTo(BigDecimal.ZERO);
        assertThat(pl.getNetProfitPercent()).isEqualByComparingTo(BigDecimal.ZERO);
        // No ArithmeticException thrown
    }

    // ── Comparison period ─────────────────────────────────────────────────────

    @Test
    void generate_withComparePeriod_populatesComparisonField() {
        LocalDate compareStart = LocalDate.of(2026, 3, 1);
        LocalDate compareEnd   = LocalDate.of(2026, 3, 7);

        // Primary period
        stubStandard7Day();

        // Comparison period: lower sales
        BigDecimal compareNetSales = new BigDecimal("50000.00");
        when(dsrRepository.sumNetSalesBetween(eq(tenantId), eq(compareStart), eq(compareEnd)))
                .thenReturn(compareNetSales);
        when(dsrRepository.sumGrossSalesBetween(eq(tenantId), eq(compareStart), eq(compareEnd)))
                .thenReturn(new BigDecimal("55000.00"));
        // Reuse same expense stubs — they use any() matchers so they'll match compare period too

        PLReportResponse report = plReportService.generate(
                tenantId, START, END, compareStart, compareEnd);

        assertThat(report.getComparison()).isNotNull();
        assertThat(report.getComparison().getNetSales()).isEqualByComparingTo(compareNetSales);
        assertThat(report.getComparison().getPeriodStart()).isEqualTo(compareStart);
    }

    @Test
    void generate_noComparePeriod_comparisonIsNull() {
        stubStandard7Day();

        PLReportResponse report = plReportService.generate(
                tenantId, START, END, null, null);

        assertThat(report.getComparison()).isNull();
    }

    // ── Benchmark thresholds ──────────────────────────────────────────────────

    @Test
    void foodCostPercent40_statusDanger() {
        // netSales = 10000, food = 4000 → 40% → DANGER
        BigDecimal netSales  = new BigDecimal("10000.00");
        BigDecimal foodCogs  = new BigDecimal("4000.00");

        when(dsrRepository.sumNetSalesBetween(any(), any(), any())).thenReturn(netSales);
        when(dsrRepository.sumGrossSalesBetween(any(), any(), any())).thenReturn(netSales);
        when(expenseRepository.sumAmountBetween(any(), any(), any())).thenReturn(foodCogs);
        when(expenseRepository.sumAmountByCategoryBetween(any(), eq("food"), any(), any()))
                .thenReturn(foodCogs);
        when(expenseRepository.sumAmountByCategoryBetween(any(), argThat(c -> !"food".equals(c)), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumByAccountBetween(any(), any(), any())).thenReturn(List.of());

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        assertThat(pl.getFoodCostPercent()).isEqualByComparingTo("40.00");
        assertThat(pl.getFoodCostStatus()).isEqualTo("DANGER");
    }

    @Test
    void foodCostPercent35_statusWarning() {
        // netSales = 10000, food = 3500 → 35% → WARNING (between 32% and 38%)
        BigDecimal netSales = new BigDecimal("10000.00");
        BigDecimal foodCogs = new BigDecimal("3500.00");

        when(dsrRepository.sumNetSalesBetween(any(), any(), any())).thenReturn(netSales);
        when(dsrRepository.sumGrossSalesBetween(any(), any(), any())).thenReturn(netSales);
        when(expenseRepository.sumAmountBetween(any(), any(), any())).thenReturn(foodCogs);
        when(expenseRepository.sumAmountByCategoryBetween(any(), eq("food"), any(), any()))
                .thenReturn(foodCogs);
        when(expenseRepository.sumAmountByCategoryBetween(any(), argThat(c -> !"food".equals(c)), any(), any()))
                .thenReturn(BigDecimal.ZERO);
        when(expenseRepository.sumByAccountBetween(any(), any(), any())).thenReturn(List.of());

        PLReportResponse pl = plReportService.computePL(tenantId, START, END);

        assertThat(pl.getFoodCostPercent()).isEqualByComparingTo("35.00");
        assertThat(pl.getFoodCostStatus()).isEqualTo("WARNING");
    }
}
