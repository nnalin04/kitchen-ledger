package com.kitchenledger.finance.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

/** Per-vendor row in the AP aging report. */
@Data
@Builder
public class APAgingEntry {

    private UUID vendorId;
    private String vendorName;

    /** Payments due within 0-30 days from today. */
    private BigDecimal current;
    /** Payments 31-60 days overdue. */
    private BigDecimal days31to60;
    /** Payments 61-90 days overdue. */
    private BigDecimal days61to90;
    /** Payments over 90 days overdue. */
    private BigDecimal days90plus;

    private BigDecimal total;
    private LocalDate oldestInvoiceDate;
}
