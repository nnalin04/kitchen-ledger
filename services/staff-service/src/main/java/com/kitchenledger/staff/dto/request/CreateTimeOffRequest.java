package com.kitchenledger.staff.dto.request;

import com.kitchenledger.staff.model.enums.TimeOffType;
import jakarta.validation.constraints.NotNull;
import lombok.Data;
import org.springframework.format.annotation.DateTimeFormat;

import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateTimeOffRequest {

    @NotNull
    private UUID employeeId;

    @NotNull
    private TimeOffType requestType;

    @NotNull
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate startDate;

    @NotNull
    @DateTimeFormat(iso = DateTimeFormat.ISO.DATE)
    private LocalDate endDate;

    private String reason;
}
