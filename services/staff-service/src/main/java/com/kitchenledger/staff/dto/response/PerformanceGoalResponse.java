package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.PerformanceGoal;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class PerformanceGoalResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private String metric;
    private BigDecimal targetValue;
    private BigDecimal currentValue;
    private LocalDate periodStart;
    private LocalDate periodEnd;
    private String status;
    private Instant createdAt;
    private Instant updatedAt;

    public static PerformanceGoalResponse from(PerformanceGoal g) {
        return PerformanceGoalResponse.builder()
                .id(g.getId())
                .tenantId(g.getTenantId())
                .employeeId(g.getEmployeeId())
                .metric(g.getMetric())
                .targetValue(g.getTargetValue())
                .currentValue(g.getCurrentValue())
                .periodStart(g.getPeriodStart())
                .periodEnd(g.getPeriodEnd())
                .status(g.getStatus())
                .createdAt(g.getCreatedAt())
                .updatedAt(g.getUpdatedAt())
                .build();
    }
}
