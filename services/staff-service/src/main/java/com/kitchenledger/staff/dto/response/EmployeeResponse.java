package com.kitchenledger.staff.dto.response;

import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.enums.EmploymentType;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class EmployeeResponse {

    private UUID id;
    private UUID tenantId;
    private UUID userId;
    private String firstName;
    private String lastName;
    private String fullName;
    private String role;
    private EmploymentType employmentType;
    private LocalDate hireDate;
    private LocalDate endDate;
    private BigDecimal hourlyRate;
    private BigDecimal monthlySalary;
    private String phone;
    private String emergencyContactName;
    private String emergencyContactPhone;
    private String notes;
    private boolean active;
    private Instant createdAt;
    private Instant updatedAt;

    public static EmployeeResponse from(Employee e) {
        return EmployeeResponse.builder()
                .id(e.getId())
                .tenantId(e.getTenantId())
                .userId(e.getUserId())
                .firstName(e.getFirstName())
                .lastName(e.getLastName())
                .fullName(e.getFullName())
                .role(e.getRole())
                .employmentType(e.getEmploymentType())
                .hireDate(e.getHireDate())
                .endDate(e.getEndDate())
                .hourlyRate(e.getHourlyRate())
                .monthlySalary(e.getMonthlySalary())
                .phone(e.getPhone())
                .emergencyContactName(e.getEmergencyContactName())
                .emergencyContactPhone(e.getEmergencyContactPhone())
                .notes(e.getNotes())
                .active(e.isActive())
                .createdAt(e.getCreatedAt())
                .updatedAt(e.getUpdatedAt())
                .build();
    }
}
