package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.TipPool;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class TipPoolResponse {

    private UUID id;
    private UUID tenantId;
    private LocalDate poolDate;
    private BigDecimal totalAmount;
    private String distributionMethod;
    private boolean distributed;
    private Instant distributedAt;
    private String notes;
    private UUID createdBy;
    private Instant createdAt;

    public static TipPoolResponse from(TipPool p) {
        return TipPoolResponse.builder()
                .id(p.getId())
                .tenantId(p.getTenantId())
                .poolDate(p.getPoolDate())
                .totalAmount(p.getTotalAmount())
                .distributionMethod(p.getDistributionMethod())
                .distributed(p.isDistributed())
                .distributedAt(p.getDistributedAt())
                .notes(p.getNotes())
                .createdBy(p.getCreatedBy())
                .createdAt(p.getCreatedAt())
                .build();
    }
}
