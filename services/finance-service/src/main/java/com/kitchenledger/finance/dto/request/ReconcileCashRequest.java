package com.kitchenledger.finance.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;

@Data
public class ReconcileCashRequest {

    @NotNull(message = "actualCash is required")
    @DecimalMin(value = "0.00", message = "actualCash must be non-negative")
    @Digits(integer = 10, fraction = 2, message = "actualCash must have at most 2 decimal places")
    private BigDecimal actualCash;
}
