package com.kitchenledger.inventory.model.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum CountStatus {
    IN_PROGRESS("in_progress"),
    COMPLETED("completed"),
    VERIFIED("verified");

    private final String value;

    CountStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static CountStatus fromValue(String text) {
        for (CountStatus b : CountStatus.values()) {
            if (String.valueOf(b.value).equalsIgnoreCase(text)) {
                return b;
            }
        }
        return null;
    }
}
