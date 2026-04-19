package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class StockTransferResponse {
    private UUID id;

    @JsonProperty("from_location")
    private String fromLocation;

    @JsonProperty("to_location")
    private String toLocation;

    private String status;

    @JsonProperty("transfer_date")
    private LocalDate transferDate;

    public String notes;

    @JsonProperty("transferred_by")
    private UUID transferredBy;

    @JsonProperty("completed_at")
    private Instant completedAt;
}
