package com.kitchenledger.finance.dto.response;

import com.kitchenledger.finance.model.VendorPayment;
import com.kitchenledger.finance.model.enums.PaymentMethod;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class VendorPaymentResponse {

    private UUID id;
    private UUID tenantId;
    private UUID vendorId;
    private UUID expenseId;
    private LocalDate paymentDate;
    private BigDecimal amount;
    private PaymentMethod paymentMethod;
    private String referenceNumber;
    private String notes;
    private LocalDate dueDate;
    private String paymentStatus;
    private UUID createdBy;
    private Instant createdAt;

    public static VendorPaymentResponse from(VendorPayment p) {
        return VendorPaymentResponse.builder()
                .id(p.getId())
                .tenantId(p.getTenantId())
                .vendorId(p.getVendorId())
                .expenseId(p.getExpenseId())
                .paymentDate(p.getPaymentDate())
                .amount(p.getAmount())
                .paymentMethod(p.getPaymentMethod())
                .referenceNumber(p.getReferenceNumber())
                .notes(p.getNotes())
                .dueDate(p.getDueDate())
                .paymentStatus(p.getPaymentStatus())
                .createdBy(p.getCreatedBy())
                .createdAt(p.getCreatedAt())
                .build();
    }
}
