package com.kitchenledger.finance.dto.response;

import com.kitchenledger.finance.model.Vendor;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class VendorResponse {

    private UUID id;
    private UUID tenantId;
    private String name;
    private String contactName;
    private String email;
    private String phone;
    private String gstin;
    private int paymentTermsDays;
    private BigDecimal outstandingBalance;
    private String notes;
    private boolean active;
    private Instant createdAt;
    private Instant updatedAt;

    public static VendorResponse from(Vendor v) {
        return VendorResponse.builder()
                .id(v.getId())
                .tenantId(v.getTenantId())
                .name(v.getName())
                .contactName(v.getContactName())
                .email(v.getEmail())
                .phone(v.getPhone())
                .gstin(v.getGstin())
                .paymentTermsDays(v.getPaymentTermsDays())
                .outstandingBalance(v.getOutstandingBalance())
                .notes(v.getNotes())
                .active(v.isActive())
                .createdAt(v.getCreatedAt())
                .updatedAt(v.getUpdatedAt())
                .build();
    }
}
