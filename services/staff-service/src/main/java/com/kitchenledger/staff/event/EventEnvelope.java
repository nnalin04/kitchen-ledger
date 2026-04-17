package com.kitchenledger.staff.event;

import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class EventEnvelope {
    private String eventId;
    private String eventType;
    private String tenantId;
    private String producedBy;
    private String producedAt;
    private String version;
    private Map<String, Object> payload;
}
