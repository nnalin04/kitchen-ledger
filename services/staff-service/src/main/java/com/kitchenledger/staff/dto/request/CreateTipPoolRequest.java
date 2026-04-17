package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateTipPoolRequest {

    @NotNull
    private LocalDate poolDate;

    @PositiveOrZero
    private BigDecimal totalAmount = BigDecimal.ZERO;

    private String distributionMethod = "equal";
    private String notes;
}
