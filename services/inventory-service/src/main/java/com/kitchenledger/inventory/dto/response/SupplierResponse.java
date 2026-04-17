package com.kitchenledger.inventory.dto.response;

import com.kitchenledger.inventory.model.Supplier;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class SupplierResponse {

    private UUID id;
    private UUID tenantId;
    private String name;
    private String contactName;
    private String email;
    private String phone;
    private String whatsapp;
    private String address;
    private int paymentTermsDays;
    private int leadTimeDays;
    private List<String> deliverySchedule;
    private String notes;
    private boolean active;
    private Instant createdAt;
    private Instant updatedAt;

    public static SupplierResponse from(Supplier s) {
        return SupplierResponse.builder()
                .id(s.getId())
                .tenantId(s.getTenantId())
                .name(s.getName())
                .contactName(s.getContactName())
                .email(s.getEmail())
                .phone(s.getPhone())
                .whatsapp(s.getWhatsapp())
                .address(s.getAddress())
                .paymentTermsDays(s.getPaymentTermsDays())
                .leadTimeDays(s.getLeadTimeDays())
                .deliverySchedule(s.getDeliverySchedule())
                .notes(s.getNotes())
                .active(s.isActive())
                .createdAt(s.getCreatedAt())
                .updatedAt(s.getUpdatedAt())
                .build();
    }
}
