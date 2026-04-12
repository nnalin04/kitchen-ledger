package com.kitchenledger.auth.dto.request;

import com.kitchenledger.auth.model.enums.UserRole;
import lombok.Data;

@Data
public class UpdateUserRequest {

    private UserRole role;

    private Boolean active;
}
