package com.kitchenledger.auth.dto.request;

import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class UpdateProfileRequest {

    @Size(max = 200)
    private String fullName;

    @Size(max = 20)
    private String phone;

    @Size(max = 10)
    private String language;
}
