package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateTrainingMilestoneRequest {

    @NotNull
    private UUID employeeId;

    @NotBlank
    private String milestoneName;

    @NotBlank
    private String category;

    private LocalDate targetDate;
    private String notes;
}
