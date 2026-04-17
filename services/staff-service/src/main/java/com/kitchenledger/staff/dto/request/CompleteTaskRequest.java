package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CompleteTaskRequest {

    @NotNull
    private UUID completedBy;

    private String notes;
    private String photoUrl;
}
