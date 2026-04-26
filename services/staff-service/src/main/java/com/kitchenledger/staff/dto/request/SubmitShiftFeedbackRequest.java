package com.kitchenledger.staff.dto.request;

import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotNull;
import lombok.Data;

@Data
public class SubmitShiftFeedbackRequest {

    @NotNull
    @Min(1)
    @Max(5)
    private Integer rating;

    /** JSON array string — e.g. ["slow service","understaffed"] */
    private String issues;

    /** JSON array string — e.g. ["oven-2 broken","missing tongs"] */
    private String equipmentFlags;

    private String moraleNote;
}
