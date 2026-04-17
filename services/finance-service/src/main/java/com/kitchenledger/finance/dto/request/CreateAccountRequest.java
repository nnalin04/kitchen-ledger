package com.kitchenledger.finance.dto.request;

import com.kitchenledger.finance.model.enums.AccountType;
import jakarta.validation.constraints.*;
import lombok.Data;

import java.util.UUID;

@Data
public class CreateAccountRequest {

    @NotBlank
    @Size(max = 20)
    private String accountCode;

    @NotBlank
    @Size(max = 200)
    private String accountName;

    @NotNull
    private AccountType accountType;

    private UUID parentId;
}
