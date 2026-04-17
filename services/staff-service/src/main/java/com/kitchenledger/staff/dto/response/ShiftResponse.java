package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Data
@Builder
public class ShiftResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private LocalDate shiftDate;
    private LocalTime startTime;
    private LocalTime endTime;
    private String roleLabel;
    private String station;
    private ShiftStatus status;
    private String notes;
    private UUID createdBy;
    private Instant createdAt;
    private Instant updatedAt;

    public static ShiftResponse from(Shift s) {
        return ShiftResponse.builder()
                .id(s.getId())
                .tenantId(s.getTenantId())
                .employeeId(s.getEmployeeId())
                .shiftDate(s.getShiftDate())
                .startTime(s.getStartTime())
                .endTime(s.getEndTime())
                .roleLabel(s.getRoleLabel())
                .station(s.getStation())
                .status(s.getStatus())
                .notes(s.getNotes())
                .createdBy(s.getCreatedBy())
                .createdAt(s.getCreatedAt())
                .updatedAt(s.getUpdatedAt())
                .build();
    }
}
