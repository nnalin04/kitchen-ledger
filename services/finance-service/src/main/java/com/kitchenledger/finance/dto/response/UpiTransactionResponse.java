package com.kitchenledger.finance.dto.response;

import com.kitchenledger.finance.model.UpiTransaction;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class UpiTransactionResponse {

    private UUID id;
    private UUID tenantId;
    private LocalDate reportDate;
    private String transactionRef;
    private BigDecimal amount;
    private String payerVpa;
    private String status;
    private Instant settledAt;
    private Instant createdAt;

    /** UPI intent URL — only populated on QR generation response; null otherwise. */
    private String upiIntentUrl;

    public static UpiTransactionResponse from(UpiTransaction tx) {
        return UpiTransactionResponse.builder()
                .id(tx.getId())
                .tenantId(tx.getTenantId())
                .reportDate(tx.getReportDate())
                .transactionRef(tx.getTransactionRef())
                .amount(tx.getAmount())
                .payerVpa(tx.getPayerVpa())
                .status(tx.getStatus())
                .settledAt(tx.getSettledAt())
                .createdAt(tx.getCreatedAt())
                .build();
    }
}
