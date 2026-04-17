package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class ClockInRequest {

    @NotNull
    private UUID employeeId;

    private UUID shiftId;
    private String notes;
}
