package com.kitchenledger.inventory.dto.response;

import lombok.Builder;
import lombok.Data;

import java.util.List;

@Data
@Builder
public class BulkImportResult {
    private int created;
    private int skipped;
    private List<String> errors;
}
