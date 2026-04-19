package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateShiftSwapRequest {

    @NotNull
    private UUID targetEmployeeId;

    @NotNull
    private UUID originalShiftId;

    /** Optional: if null, this is an open swap request. */
    private UUID targetShiftId;

    private String requestReason;
}
