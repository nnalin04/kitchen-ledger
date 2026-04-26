package com.kitchenledger.finance.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/**
 * Full P&L report for a given period.
 * Benchmark statuses: "GOOD", "WARNING", "DANGER"
 */
@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class PLReportResponse {

    private LocalDate periodStart;
    private LocalDate periodEnd;

    // ── Revenue ───────────────────────────────────────────────────────────────
    private BigDecimal netSales;
    private BigDecimal grossSales;
    private BigDecimal otherSales; // other_sales column on DSR

    // ── Section totals ────────────────────────────────────────────────────────
    /** Total cost-of-goods expenses for the period. */
    private BigDecimal totalCogs;
    /** Total labor / wage expenses for the period. */
    private BigDecimal totalLabor;
    /** Total operating expenses (non-COGS, non-labor) for the period. */
    private BigDecimal totalOperating;

    // ── Derived metrics ───────────────────────────────────────────────────────
    /** grossProfit = netSales - totalCogs */
    private BigDecimal grossProfit;
    /** primeCost = totalCogs + totalLabor */
    private BigDecimal primeCost;
    /** netProfit = grossProfit - totalLabor - totalOperating */
    private BigDecimal netProfit;

    // ── Percentages (% of netSales, scale 2) ──────────────────────────────────
    private BigDecimal foodCostPercent;
    private BigDecimal laborCostPercent;
    private BigDecimal primeCostPercent;
    private BigDecimal netProfitPercent;

    // ── Benchmark statuses ────────────────────────────────────────────────────
    /** "GOOD" | "WARNING" | "DANGER" */
    private String foodCostStatus;
    private String laborStatus;
    private String primeCostStatus;
    private String netProfitStatus;

    // ── Line-item breakdowns ──────────────────────────────────────────────────
    private List<PLSectionItem> cogsItems;
    private List<PLSectionItem> laborItems;
    private List<PLSectionItem> operatingItems;

    // ── Optional comparison period ────────────────────────────────────────────
    private PLReportResponse comparison;
}
