package com.kitchenledger.inventory.dto.request;

import jakarta.validation.constraints.*;
import lombok.Data;

@Data
public class CreateSupplierRequest {

    @NotBlank
    @Size(max = 200)
    private String name;

    private String contactName;
    private String email;
    private String phone;
    private String whatsapp;
    private String address;

    @Min(0)
    private int paymentTermsDays = 30;

    @Min(0)
    private int leadTimeDays = 1;

    private String notes;
}
