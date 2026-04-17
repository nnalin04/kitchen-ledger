package com.kitchenledger.finance.job;

import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.finance.event.OutboxEvent;
import com.kitchenledger.finance.event.OutboxEventRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.List;
import java.util.Map;

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
            .findByReplayedAtIsNullAndRetryCountLessThan(MAX_RETRY_COUNT);

        if (pending.isEmpty()) return;

        log.info("Outbox replay: {} pending event(s) to retry", pending.size());

        for (OutboxEvent event : pending) {
            try {
                Map<String, Object> payload = objectMapper.readValue(
                    event.getPayload(), new TypeReference<>() {});
                rabbitTemplate.convertAndSend(exchange, event.getRoutingKey(), payload);
                event.setReplayedAt(Instant.now());
                log.info("Outbox replay success: key={} id={}", event.getRoutingKey(), event.getId());
            } catch (Exception e) {
                event.setRetryCount(event.getRetryCount() + 1);
                event.setLastError(e.getMessage());
                log.error("Outbox replay failed for id={}: {}", event.getId(), e.getMessage());
            }
            outboxEventRepository.save(event);
        }
    }
}
