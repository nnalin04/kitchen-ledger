package com.kitchenledger.inventory.dto;

import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.util.UUID;

@Data
@Builder
public class InventoryCountResponse {
    private UUID id;
    
    @JsonProperty("count_type")
    private String countType;
    
    @JsonProperty("abc_filter")
    private String abcFilter;
    
    private String status;
    
    @JsonProperty("count_date")
    private LocalDate countDate;
    
    @JsonProperty("started_at")
    private Instant startedAt;
    
    @JsonProperty("completed_at")
    private Instant completedAt;
    
    @JsonProperty("counted_by")
    private UUID countedBy;
    
    private String notes;
    
    @JsonProperty("total_variance_cost")
    private BigDecimal totalVarianceCost;
}
