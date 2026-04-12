package com.kitchenledger.finance.exception;

public class ConflictException extends RuntimeException {
    public ConflictException(String message) {
        super(message);
    }

    public ConflictException(String resource, String field, Object value) {
        super(resource + " already exists with " + field + ": " + value);
    }
}
