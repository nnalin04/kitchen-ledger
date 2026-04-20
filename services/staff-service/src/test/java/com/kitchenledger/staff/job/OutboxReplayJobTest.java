package com.kitchenledger.staff.job;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.staff.event.EventEnvelope;
import com.kitchenledger.staff.event.OutboxEvent;
import com.kitchenledger.staff.event.OutboxEventRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.test.util.ReflectionTestUtils;

import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class OutboxReplayJobTest {

    @Mock private RabbitTemplate rabbitTemplate;
    @Mock private OutboxEventRepository outboxEventRepository;

    @InjectMocks private OutboxReplayJob replayJob;

    private final ObjectMapper objectMapper = new ObjectMapper();

    @BeforeEach
    void setUp() {
        ReflectionTestUtils.setField(replayJob, "objectMapper", objectMapper);
        ReflectionTestUtils.setField(replayJob, "exchange", "kitchenledger.events");
    }

    // ── Replayed message must be a full EventEnvelope ────────────────────────

    @Test
    void replayPendingEvents_publishesFullEventEnvelope_notBareMap() throws Exception {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType("staff.employee.hired")
                .tenantId(UUID.randomUUID().toString())
                .producedBy("staff-service")
                .producedAt(Instant.now().toString())
                .version("1.0")
                .payload(Map.of("employee_id", "emp-1", "full_name", "John Doe"))
                .build();

        OutboxEvent outboxRow = OutboxEvent.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .routingKey("staff.employee.hired")
                .payload(objectMapper.writeValueAsString(envelope))
                .failedAt(Instant.now())
                .retryCount(0)
                .build();

        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of(outboxRow));
        when(outboxEventRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        replayJob.replayPendingEvents();

        ArgumentCaptor<Object> messageCaptor = ArgumentCaptor.forClass(Object.class);
        verify(rabbitTemplate).convertAndSend(eq("kitchenledger.events"),
                eq("staff.employee.hired"), messageCaptor.capture());

        Object sent = messageCaptor.getValue();
        assertThat(sent).isInstanceOf(EventEnvelope.class);
        EventEnvelope sentEnvelope = (EventEnvelope) sent;
        assertThat(sentEnvelope.getEventType()).isEqualTo("staff.employee.hired");
        assertThat(sentEnvelope.getTenantId()).isEqualTo(envelope.getTenantId());
        assertThat(sentEnvelope.getProducedBy()).isEqualTo("staff-service");
    }

    @Test
    void replayPendingEvents_envelopePreservesOriginalEventId() throws Exception {
        String originalEventId = UUID.randomUUID().toString();
        EventEnvelope envelope = EventEnvelope.builder()
                .eventId(originalEventId)
                .eventType("staff.shift.created")
                .tenantId(UUID.randomUUID().toString())
                .producedBy("staff-service")
                .producedAt(Instant.now().toString())
                .version("1.0")
                .payload(Map.of())
                .build();

        OutboxEvent row = outboxRow("staff.shift.created",
                objectMapper.writeValueAsString(envelope));

        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of(row));
        when(outboxEventRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        replayJob.replayPendingEvents();

        ArgumentCaptor<Object> captor = ArgumentCaptor.forClass(Object.class);
        verify(rabbitTemplate).convertAndSend(anyString(), anyString(), captor.capture());
        assertThat(((EventEnvelope) captor.getValue()).getEventId()).isEqualTo(originalEventId);
    }

    // ── Success path ──────────────────────────────────────────────────────────

    @Test
    void replayPendingEvents_success_setsReplayedAt() throws Exception {
        OutboxEvent row = outboxRow("staff.employee.hired",
                objectMapper.writeValueAsString(sampleEnvelope("staff.employee.hired")));

        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of(row));
        when(outboxEventRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        replayJob.replayPendingEvents();

        assertThat(row.getReplayedAt()).isNotNull();
        verify(outboxEventRepository).save(row);
    }

    // ── Failure path ──────────────────────────────────────────────────────────

    @Test
    void replayPendingEvents_publishFailure_incrementsRetryCount() throws Exception {
        OutboxEvent row = outboxRow("staff.employee.hired",
                objectMapper.writeValueAsString(sampleEnvelope("staff.employee.hired")));

        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of(row));
        doThrow(new RuntimeException("broker unavailable"))
                .when(rabbitTemplate).convertAndSend(anyString(), anyString(), any(Object.class));
        when(outboxEventRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        replayJob.replayPendingEvents();

        assertThat(row.getRetryCount()).isEqualTo(1);
        assertThat(row.getLastError()).contains("broker unavailable");
        assertThat(row.getReplayedAt()).isNull();
    }

    // ── Legacy / malformed outbox rows ────────────────────────────────────────

    @Test
    void replayPendingEvents_legacyBarePayloadRow_marksFailedNotSilentlyDropped() throws Exception {
        // Old format: only the inner payload Map was stored (pre NC-1 fix)
        String legacyPayload = objectMapper.writeValueAsString(
                Map.of("employee_id", "emp-1", "full_name", "John Doe"));
        OutboxEvent row = outboxRow("staff.employee.hired", legacyPayload);

        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of(row));
        when(outboxEventRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        replayJob.replayPendingEvents();

        // Should NOT send the bare map — should mark as failed with a reason
        verify(rabbitTemplate, never()).convertAndSend(anyString(), anyString(), any(Object.class));
        assertThat(row.getLastError()).contains("legacy");
        assertThat(row.getRetryCount()).isEqualTo(5); // max retries — permanently failed
    }

    // ── No pending events ─────────────────────────────────────────────────────

    @Test
    void replayPendingEvents_noPendingRows_doesNothing() {
        when(outboxEventRepository.findByReplayedAtIsNullAndRetryCountLessThan(anyInt()))
                .thenReturn(List.of());

        replayJob.replayPendingEvents();

        verifyNoInteractions(rabbitTemplate);
        verify(outboxEventRepository, never()).save(any());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private OutboxEvent outboxRow(String routingKey, String payload) {
        return OutboxEvent.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .routingKey(routingKey)
                .payload(payload)
                .failedAt(Instant.now())
                .retryCount(0)
                .build();
    }

    private EventEnvelope sampleEnvelope(String eventType) {
        return EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .tenantId(UUID.randomUUID().toString())
                .producedBy("staff-service")
                .producedAt(Instant.now().toString())
                .version("1.0")
                .payload(Map.of("key", "value"))
                .build();
    }
}
