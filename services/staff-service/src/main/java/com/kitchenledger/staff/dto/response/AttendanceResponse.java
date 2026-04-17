package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.Attendance;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.UUID;

@Data
@Builder
public class AttendanceResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private UUID shiftId;
    private Instant clockInAt;
    private Instant clockOutAt;
    private BigDecimal hoursWorked;
    private int lateMinutes;
    private String notes;
    private UUID recordedBy;
    private Instant createdAt;

    public static AttendanceResponse from(Attendance a) {
        return AttendanceResponse.builder()
                .id(a.getId())
                .tenantId(a.getTenantId())
                .employeeId(a.getEmployeeId())
                .shiftId(a.getShiftId())
                .clockInAt(a.getClockInAt())
                .clockOutAt(a.getClockOutAt())
                .hoursWorked(a.getHoursWorked())
                .lateMinutes(a.getLateMinutes())
                .notes(a.getNotes())
                .recordedBy(a.getRecordedBy())
                .createdAt(a.getCreatedAt())
                .build();
    }
}
