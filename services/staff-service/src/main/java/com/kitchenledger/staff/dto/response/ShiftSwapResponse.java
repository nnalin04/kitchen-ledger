package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.ShiftSwap;
import com.kitchenledger.staff.model.enums.ShiftSwapStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class ShiftSwapResponse {

    private UUID id;
    private UUID tenantId;
    private UUID requestingEmployeeId;
    private UUID targetEmployeeId;
    private UUID originalShiftId;
    private UUID targetShiftId;
    private ShiftSwapStatus status;
    private String requestReason;
    private UUID reviewedBy;
    private Instant reviewedAt;
    private Instant createdAt;

    public static ShiftSwapResponse from(ShiftSwap s) {
        return ShiftSwapResponse.builder()
                .id(s.getId())
                .tenantId(s.getTenantId())
                .requestingEmployeeId(s.getRequestingEmployeeId())
                .targetEmployeeId(s.getTargetEmployeeId())
                .originalShiftId(s.getOriginalShiftId())
                .targetShiftId(s.getTargetShiftId())
                .status(s.getStatus())
                .requestReason(s.getRequestReason())
                .reviewedBy(s.getReviewedBy())
                .reviewedAt(s.getReviewedAt())
                .createdAt(s.getCreatedAt())
                .build();
    }
}
