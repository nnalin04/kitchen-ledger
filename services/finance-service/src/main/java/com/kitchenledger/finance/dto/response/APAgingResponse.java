package com.kitchenledger.finance.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.util.List;

/** Accounts-payable aging summary response. */
@Data
@Builder
public class APAgingResponse {

    private BigDecimal totalOutstanding;
    private BigDecimal totalOverdue;
    /** Amount due within the next 7 days. */
    private BigDecimal dueSoon;

    private List<APAgingEntry> vendors;
}
