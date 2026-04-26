package com.kitchenledger.finance.dto.response;

import com.fasterxml.jackson.annotation.JsonInclude;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/** Finance dashboard KPI snapshot for the home screen. */
@Data
@Builder
@JsonInclude(JsonInclude.Include.NON_NULL)
public class DashboardKpiResponse {

    /** Yesterday's net sales. */
    private BigDecimal yesterdayNetSales;

    /** Percent change vs same weekday last week. Positive = up, negative = down. */
    private BigDecimal yesterdayNetSalesChangePercent;

    /** Yesterday's cash over/short variance (actual − expected). */
    private BigDecimal yesterdayCashOverShort;

    /** Rolling 7-day food cost % (total COGS category expenses / net sales). */
    private BigDecimal foodCostPercent7d;

    /** Rolling 7-day labor cost % (total labor category expenses / net sales). */
    private BigDecimal laborCostPercent7d;

    /** Rolling 7-day average sales per labor hour (placeholder — 0 when no staff data). */
    private BigDecimal avgSplh7d;

    /** Yesterday's guest / covers count. */
    private int yesterdayGuestCount;

    /** Yesterday's average check size (net sales / covers). */
    private BigDecimal avgCheckSize;

    /** Number of vendor payments in pending/overdue status. */
    private int pendingApCount;

    /** Total outstanding amount across all pending/overdue vendor payments. */
    private BigDecimal pendingApTotal;
}
