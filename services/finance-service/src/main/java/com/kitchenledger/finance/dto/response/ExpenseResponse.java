package com.kitchenledger.finance.dto.response;

import com.kitchenledger.finance.model.Expense;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class ExpenseResponse {

    private UUID id;
    private UUID tenantId;
    private LocalDate expenseDate;
    private String category;
    private String description;
    private BigDecimal amount;
    private UUID vendorId;
    private PaymentMethod paymentMethod;
    private String referenceNumber;
    private String receiptUrl;
    private boolean recurring;
    private UUID accountId;
    private UUID createdBy;
    private UUID approvedBy;
    private Instant createdAt;
    private Instant updatedAt;

    public static ExpenseResponse from(Expense e) {
        return ExpenseResponse.builder()
                .id(e.getId())
                .tenantId(e.getTenantId())
                .expenseDate(e.getExpenseDate())
                .category(e.getCategory())
                .description(e.getDescription())
                .amount(e.getAmount())
                .vendorId(e.getVendorId())
                .paymentMethod(e.getPaymentMethod())
                .referenceNumber(e.getReferenceNumber())
                .receiptUrl(e.getReceiptUrl())
                .recurring(e.isRecurring())
                .accountId(e.getAccountId())
                .createdBy(e.getCreatedBy())
                .approvedBy(e.getApprovedBy())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
