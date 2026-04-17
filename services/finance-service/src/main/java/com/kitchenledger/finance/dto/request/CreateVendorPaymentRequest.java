package com.kitchenledger.finance.dto.request;

import com.kitchenledger.finance.model.enums.PaymentMethod;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateVendorPaymentRequest {

    @NotNull
    private UUID vendorId;

    private UUID expenseId;

    @NotNull
    private LocalDate paymentDate;

    @Positive
    private BigDecimal amount;

    private PaymentMethod paymentMethod = PaymentMethod.cash;
    private String referenceNumber;
    private String notes;

    /** Optional: when this payment is due. Null = already paid on paymentDate. */
    private LocalDate dueDate;

    /** "pending" | "paid". Defaults to "paid" when not specified. */
    private String paymentStatus = "paid";
}
