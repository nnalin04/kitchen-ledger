package com.kitchenledger.inventory.dto;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotEmpty;
import lombok.Data;

import java.util.List;

@Data
public class CountItemListRequest {
    @NotEmpty
    @Valid
    private List<CountItemRequest> items;
}
