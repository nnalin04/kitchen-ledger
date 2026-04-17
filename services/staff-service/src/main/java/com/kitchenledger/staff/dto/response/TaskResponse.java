package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.Task;
import com.kitchenledger.staff.model.enums.TaskPriority;
import com.kitchenledger.staff.model.enums.TaskStatus;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class TaskResponse {

    private UUID id;
    private UUID tenantId;
    private String title;
    private String description;
    private UUID assignedTo;
    private LocalDate dueDate;
    private TaskPriority priority;
    private TaskStatus status;
    private boolean recurring;
    private UUID createdBy;
    private Instant createdAt;
    private Instant updatedAt;

    public static TaskResponse from(Task t) {
        return TaskResponse.builder()
                .id(t.getId())
                .tenantId(t.getTenantId())
                .title(t.getTitle())
                .description(t.getDescription())
                .assignedTo(t.getAssignedTo())
                .dueDate(t.getDueDate())
                .priority(t.getPriority())
                .status(t.getStatus())
                .recurring(t.isRecurring())
                .createdBy(t.getCreatedBy())
                .createdAt(t.getCreatedAt())
                .updatedAt(t.getUpdatedAt())
                .build();
    }
}
