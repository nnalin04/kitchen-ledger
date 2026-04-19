package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.TrainingMilestone;
import com.kitchenledger.staff.model.enums.TrainingStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class TrainingMilestoneResponse {

    private UUID id;
    private UUID tenantId;
    private UUID employeeId;
    private String milestoneName;
    private String category;
    private LocalDate targetDate;
    private LocalDate completedDate;
    private TrainingStatus status;
    private String notes;
    private Instant createdAt;

    public static TrainingMilestoneResponse from(TrainingMilestone m) {
        return TrainingMilestoneResponse.builder()
                .id(m.getId())
                .tenantId(m.getTenantId())
                .employeeId(m.getEmployeeId())
                .milestoneName(m.getMilestoneName())
                .category(m.getCategory())
                .targetDate(m.getTargetDate())
                .completedDate(m.getCompletedDate())
                .status(m.getStatus())
                .notes(m.getNotes())
                .createdAt(m.getCreatedAt())
                .build();
    }
}
