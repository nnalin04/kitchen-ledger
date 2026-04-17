package com.kitchenledger.staff.dto.request;

import com.kitchenledger.staff.model.enums.EmploymentType;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateEmployeeRequest {

    @NotBlank
    @Size(max = 100)
    private String firstName;

    @NotBlank
    @Size(max = 100)
    private String lastName;

    @NotBlank
    private String role;

    private EmploymentType employmentType = EmploymentType.full_time;

    @NotNull
    private LocalDate hireDate;

    private BigDecimal hourlyRate;
    private BigDecimal monthlySalary;
    private String phone;
    private String emergencyContactName;
    private String emergencyContactPhone;
    private String notes;
    private UUID userId;
}
