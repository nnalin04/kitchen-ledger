package com.kitchenledger.auth.event;

import lombok.Builder;
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
public class EventEnvelope {

    @Builder.Default
    private String eventId = UUID.randomUUID().toString();

    private String eventType;

    private UUID tenantId;

    private String producedBy;

    @Builder.Default
    private Instant producedAt = Instant.now();

    @Builder.Default
    private String version = "1.0";

    private Map<String, Object> payload;
}
