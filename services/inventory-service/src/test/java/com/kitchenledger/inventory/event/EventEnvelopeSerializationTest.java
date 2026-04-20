package com.kitchenledger.inventory.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import org.junit.jupiter.api.Test;

import java.util.Map;

import static org.assertj.core.api.Assertions.assertThat;

class EventEnvelopeSerializationTest {

    private final ObjectMapper objectMapper = new ObjectMapper();

    @Test
    void serializesSnakeCaseEnvelopeKeys() throws Exception {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventId("evt-1")
                .eventType("inventory.stock.low")
                .tenantId("tenant-1")
                .producedBy("inventory-service")
                .producedAt("2026-04-20T10:00:00Z")
                .version("1.0")
                .correlationId("corr-1")
                .payload(Map.of("item_name", "Onion"))
                .build();

        String json = objectMapper.writeValueAsString(envelope);

        assertThat(json).contains("\"event_id\"");
        assertThat(json).contains("\"event_type\"");
        assertThat(json).contains("\"tenant_id\"");
        assertThat(json).contains("\"produced_by\"");
        assertThat(json).contains("\"produced_at\"");
        assertThat(json).contains("\"correlation_id\"");
        assertThat(json).doesNotContain("eventType");
        assertThat(json).doesNotContain("tenantId");
    }

    @Test
    void deserializesLegacyCamelCaseDuringMigration() throws Exception {
        String legacy = """
            {
              "eventId":"evt-2",
              "eventType":"inventory.stock.low",
              "tenantId":"tenant-2",
              "producedBy":"inventory-service",
              "producedAt":"2026-04-20T10:00:00Z",
              "version":"1.0",
              "correlationId":"corr-2",
              "payload":{"item_name":"Tomato"}
            }
            """;

        EventEnvelope envelope = objectMapper.readValue(legacy, EventEnvelope.class);

        assertThat(envelope.getEventId()).isEqualTo("evt-2");
        assertThat(envelope.getEventType()).isEqualTo("inventory.stock.low");
        assertThat(envelope.getTenantId()).isEqualTo("tenant-2");
    }
}
