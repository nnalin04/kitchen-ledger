package com.kitchenledger.finance.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;

/**
 * A single line item within a P&L section (COGS, Labor, Operating).
 * {@code percentOfRevenue} = (amount / netSales) * 100, rounded to 2dp.
 */
@Data
@Builder
public class PLSectionItem {
    private String name;
    private BigDecimal amount;
    /** percentage of net sales, scale 2, HALF_UP */
    private BigDecimal percentOfRevenue;
}
