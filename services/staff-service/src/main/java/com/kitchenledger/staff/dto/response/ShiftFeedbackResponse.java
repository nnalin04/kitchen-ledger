package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.ShiftFeedback;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class ShiftFeedbackResponse {

    private UUID id;
    private UUID tenantId;
    private UUID shiftId;
    private UUID employeeId;
    private Integer rating;
    private String issues;
    private String equipmentFlags;
    private String moraleNote;
    private Instant submittedAt;

    public static ShiftFeedbackResponse from(ShiftFeedback f) {
        return ShiftFeedbackResponse.builder()
                .id(f.getId())
                .tenantId(f.getTenantId())
                .shiftId(f.getShiftId())
                .employeeId(f.getEmployeeId())
                .rating(f.getRating())
                .issues(f.getIssues())
                .equipmentFlags(f.getEquipmentFlags())
                .moraleNote(f.getMoraleNote())
                .submittedAt(f.getSubmittedAt())
                .build();
    }
}
