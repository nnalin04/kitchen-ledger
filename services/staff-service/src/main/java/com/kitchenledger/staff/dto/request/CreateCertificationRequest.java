package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

import java.time.LocalDate;
import java.util.UUID;

@Data
public class CreateCertificationRequest {

    @NotNull
    private UUID employeeId;

    @NotBlank
    private String certName;

    private String certNumber;
    private String issuedBy;
    private LocalDate issuedDate;
    private LocalDate expiryDate;
    private String documentUrl;
}
