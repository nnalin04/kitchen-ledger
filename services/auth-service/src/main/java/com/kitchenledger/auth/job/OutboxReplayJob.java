package com.kitchenledger.auth.job;


import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.auth.event.EventEnvelope;
import com.kitchenledger.auth.event.OutboxEvent;
import com.kitchenledger.auth.event.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;

@Component
@RequiredArgsConstructor
@Slf4j
public class OutboxReplayJob {

    private final RabbitTemplate rabbitTemplate;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    private static final int MAX_RETRY_COUNT = 5;

    @Scheduled(fixedDelay = 300_000) // every 5 minutes
    public void replayPendingEvents() {
        List<OutboxEvent> pending = outboxEventRepository
            .findPendingForUpdate(MAX_RETRY_COUNT);

        if (pending.isEmpty()) return;

        log.info("Outbox replay: {} pending event(s) to retry", pending.size());

        for (OutboxEvent event : pending) {
            try {
                EventEnvelope envelope = objectMapper.readValue(event.getPayload(), EventEnvelope.class);

                // Legacy guard: bare payload rows don't have event_type — mark permanently failed
                if (envelope.getEventType() == null || envelope.getEventType().isBlank()) {
                    event.setRetryCount(MAX_RETRY_COUNT);
                    event.setLastError("legacy outbox row: payload missing event_type — cannot replay as valid envelope");
                    log.error("Outbox replay skipped (legacy format) id={} key={}", event.getId(), event.getRoutingKey());
                    outboxEventRepository.save(event);
                    continue;
                }

                rabbitTemplate.convertAndSend(exchange, event.getRoutingKey(), envelope);
                event.setReplayedAt(Instant.now());
                log.info("Outbox replay success: key={} eventId={} outboxId={}",
                        event.getRoutingKey(), envelope.getEventId(), event.getId());
            } catch (Exception e) {
                event.setRetryCount(event.getRetryCount() + 1);
                event.setLastError(e.getMessage());
                log.error("Outbox replay failed for id={}: {}", event.getId(), e.getMessage());
            }
            outboxEventRepository.save(event);
        }
    }
}
