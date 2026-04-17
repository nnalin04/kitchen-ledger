package com.kitchenledger.staff.dto.request;

import com.kitchenledger.staff.model.enums.TaskPriority;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateTaskRequest {

    @NotBlank
    @Size(max = 200)
    private String title;

    private String description;
    private UUID assignedTo;
    private LocalDate dueDate;
    private TaskPriority priority = TaskPriority.medium;
    private boolean recurring = false;
}
