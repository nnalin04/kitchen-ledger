package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreatePerformanceGoalRequest {

    @NotBlank
    private String metric;

    @NotNull
    @DecimalMin("0")
    private BigDecimal targetValue;

    @NotNull
    private LocalDate periodStart;

    @NotNull
    private LocalDate periodEnd;
}
