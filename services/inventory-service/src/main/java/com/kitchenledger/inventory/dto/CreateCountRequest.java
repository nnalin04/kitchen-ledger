package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import jakarta.validation.constraints.NotBlank;
import lombok.Data;

@Data
public class CreateCountRequest {
    @NotBlank
    @JsonProperty("count_type")
    private String countType;

    private String notes;

    @JsonProperty("abc_filter")
    private String abcFilter;
}
