package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class CreateTransferRequest {

    @NotBlank
    @JsonProperty("from_location")
    private String fromLocation;

    @NotBlank
    @JsonProperty("to_location")
    private String toLocation;

    private String notes;

    @NotEmpty
    @Valid
    private List<TransferItemRequest> items;
}
