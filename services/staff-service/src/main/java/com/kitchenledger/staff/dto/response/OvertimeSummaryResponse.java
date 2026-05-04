package com.kitchenledger.staff.dto.response;

import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.UUID;

@Data
@Builder
public class OvertimeSummaryResponse {

    private LocalDate weekStart;
    private LocalDate weekEnd;
    private List<EmployeeOvertimeEntry> employees;

    @Data
    @Builder
    public static class EmployeeOvertimeEntry {
        private UUID employeeId;
        private String employeeName;
        private String position;
        private BigDecimal totalHours;
        private BigDecimal regularHours;
        private BigDecimal overtimeHours;
        private boolean overtimeApproaching;
        private boolean overtimeExceeded;
    }
}
