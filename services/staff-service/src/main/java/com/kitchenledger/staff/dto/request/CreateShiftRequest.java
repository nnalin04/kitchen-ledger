package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.UUID;

@Data
public class CreateShiftRequest {

    @NotNull
    private UUID employeeId;

    @NotNull
    private LocalDate shiftDate;

    @NotNull
    private LocalTime startTime;

    @NotNull
    private LocalTime endTime;

    private String roleLabel;
    private String station;
    private String notes;
    /** Set to true for cross-midnight shifts where end_time < start_time (e.g., 23:00-03:00). */
    private boolean endsNextDay;
}
