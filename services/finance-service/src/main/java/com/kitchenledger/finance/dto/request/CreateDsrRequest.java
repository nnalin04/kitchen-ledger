package com.kitchenledger.finance.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;

@Data
public class CreateDsrRequest {

    @NotNull
    private LocalDate reportDate;

    @Min(0)
    private int coversCount = 0;

    @PositiveOrZero
    private BigDecimal grossSales = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal discounts = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal cashSales = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal upiSales = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal cardSales = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal otherSales = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal vatCollected = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal serviceChargeCollected = BigDecimal.ZERO;

    @PositiveOrZero
    private BigDecimal costOfGoodsSold = BigDecimal.ZERO;

    private String notes;
}
