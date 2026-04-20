package com.kitchenledger.auth.event;

import com.fasterxml.jackson.annotation.JsonIgnoreProperties;
import com.fasterxml.jackson.annotation.JsonAlias;
import com.fasterxml.jackson.annotation.JsonProperty;
import lombok.AllArgsConstructor;
import lombok.Builder;
import lombok.NoArgsConstructor;
import lombok.Data;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

/**
 * Standard RabbitMQ event envelope for all KitchenLedger events.
 * Every service must wrap its events in this envelope before publishing.
 */
@Data
@Builder
@NoArgsConstructor
@AllArgsConstructor
@JsonIgnoreProperties(ignoreUnknown = true)
public class EventEnvelope {

    @Builder.Default
    @JsonProperty("event_id")
    @JsonAlias("eventId")
    private String eventId = UUID.randomUUID().toString();

    @JsonProperty("event_type")
    @JsonAlias("eventType")
    private String eventType;

    @JsonProperty("tenant_id")
    @JsonAlias("tenantId")
    private UUID tenantId;

    @JsonProperty("produced_by")
    @JsonAlias("producedBy")
    private String producedBy;

    @Builder.Default
    @JsonProperty("produced_at")
    @JsonAlias("producedAt")
    private Instant producedAt = Instant.now();

    @Builder.Default
    @JsonProperty("version")
    private String version = "1.0";

    @JsonProperty("correlation_id")
    @JsonAlias("correlationId")
    private String correlationId;

    @JsonProperty("payload")
    private Map<String, Object> payload;
}
