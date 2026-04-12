package com.kitchenledger.auth.dto.request;

import com.kitchenledger.auth.model.enums.UserRole;
import jakarta.validation.constraints.Email;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;
import lombok.Data;

@Data
public class InviteUserRequest {

    @NotBlank
    @Email
    private String email;

    @NotBlank
    @Size(max = 200)
    private String fullName;

    @NotNull
    private UserRole role;

    @Size(max = 20)
    private String phone;
}
