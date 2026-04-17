package com.kitchenledger.finance.dto.request;

import com.kitchenledger.finance.model.enums.PaymentMethod;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateExpenseRequest {

    @NotNull
    private LocalDate expenseDate;

    @NotBlank
    private String category;

    @NotBlank
    @Size(max = 500)
    private String description;

    @Positive
    private BigDecimal amount;

    private UUID vendorId;
    private PaymentMethod paymentMethod = PaymentMethod.cash;
    private String referenceNumber;
    private String receiptUrl;
    private boolean recurring = false;
    private UUID accountId;
}
