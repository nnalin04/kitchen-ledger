package com.kitchenledger.staff.event;

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
                .eventType("staff.employee.noshow")
                .tenantId("tenant-1")
                .producedBy("staff-service")
                .producedAt("2026-04-20T10:00:00Z")
                .version("1.0")
                .correlationId("corr-1")
                .payload(Map.of("employee_name", "Sam"))
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
              "eventType":"staff.employee.noshow",
              "tenantId":"tenant-2",
              "producedBy":"staff-service",
              "producedAt":"2026-04-20T10:00:00Z",
              "version":"1.0",
              "correlationId":"corr-2",
              "payload":{"employee_name":"Ravi"}
            }
            """;

        EventEnvelope envelope = objectMapper.readValue(legacy, EventEnvelope.class);

        assertThat(envelope.getEventId()).isEqualTo("evt-2");
        assertThat(envelope.getEventType()).isEqualTo("staff.employee.noshow");
        assertThat(envelope.getTenantId()).isEqualTo("tenant-2");
    }
}
