package com.kitchenledger.inventory.model.enums;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonValue;

public enum TransferStatus {
    PENDING("pending"),
    APPROVED("approved"),
    COMPLETED("completed"),
    CANCELLED("cancelled");

    private final String value;

    TransferStatus(String value) {
        this.value = value;
    }

    @JsonValue
    public String getValue() {
        return value;
    }

    @JsonCreator
    public static TransferStatus fromValue(String text) {
        for (TransferStatus b : TransferStatus.values()) {
            if (String.valueOf(b.value).equalsIgnoreCase(text)) {
                return b;
            }
        }
        return null;
    }
}
