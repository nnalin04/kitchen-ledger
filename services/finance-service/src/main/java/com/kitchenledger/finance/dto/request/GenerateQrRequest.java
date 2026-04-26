package com.kitchenledger.finance.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class GenerateQrRequest {

    @NotNull
    @DecimalMin("0.01")
    private BigDecimal amount;

    private String description;

    /** Optional — associates the generated QR with a specific Daily Sales Report. */
    private LocalDate reportDate;

    /** Tenant's registered UPI VPA (e.g. restaurantname@upi). Required for production use. */
    private String merchantUpiId;
}
