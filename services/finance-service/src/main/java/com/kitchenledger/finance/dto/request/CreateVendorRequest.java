package com.kitchenledger.finance.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class CreateVendorRequest {

    @NotBlank
    @Size(max = 200)
    private String name;

    private String contactName;

    @Email
    private String email;

    private String phone;
    private String gstin;

    @Min(0)
    private int paymentTermsDays = 30;

    private String notes;
}
