package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.TimeOffRequest;
import com.kitchenledger.staff.model.enums.TimeOffStatus;
import com.kitchenledger.staff.model.enums.TimeOffType;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class TimeOffRequestResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private TimeOffType requestType;
    private LocalDate startDate;
    private LocalDate endDate;
    private String reason;
    private TimeOffStatus status;
    private UUID reviewedBy;
    private Instant reviewedAt;
    private String reviewNotes;
    private Instant createdAt;

    public static TimeOffRequestResponse from(TimeOffRequest r) {
        return TimeOffRequestResponse.builder()
                .id(r.getId())
                .tenantId(r.getTenantId())
                .employeeId(r.getEmployeeId())
                .requestType(r.getRequestType())
                .startDate(r.getStartDate())
                .endDate(r.getEndDate())
                .reason(r.getReason())
                .status(r.getStatus())
                .reviewedBy(r.getReviewedBy())
                .reviewedAt(r.getReviewedAt())
                .reviewNotes(r.getReviewNotes())
                .createdAt(r.getCreatedAt())
                .build();
    }
}
