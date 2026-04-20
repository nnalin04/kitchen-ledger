package com.kitchenledger.finance.event;

import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.Builder;
import lombok.Data;

import java.util.Map;

@Data
@Builder
public class EventEnvelope {
    @JsonProperty("event_id")
    @JsonAlias("eventId")
    private String eventId;

    @JsonProperty("event_type")
    @JsonAlias("eventType")
    private String eventType;

    @JsonProperty("tenant_id")
    @JsonAlias("tenantId")
    private String tenantId;

    @JsonProperty("produced_by")
    @JsonAlias("producedBy")
    private String producedBy;

    @JsonProperty("produced_at")
    @JsonAlias("producedAt")
    private String producedAt;

    @JsonProperty("version")
    private String version;

    @JsonProperty("correlation_id")
    @JsonAlias("correlationId")
    private String correlationId;

    @JsonProperty("payload")
    private Map<String, Object> payload;
}
