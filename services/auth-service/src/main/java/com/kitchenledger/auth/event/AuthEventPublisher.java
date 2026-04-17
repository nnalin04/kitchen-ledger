package com.kitchenledger.auth.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.model.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuthEventPublisher {

    private static final String EXCHANGE = "kitchenledger.events";

    private final RabbitTemplate rabbitTemplate;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishUserRegistered(User user, Tenant tenant) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.user.registered")
                .tenantId(tenant.getId())
                .producedBy("auth-service")
                .payload(Map.of(
                        "user_id", user.getId().toString(),
                        "email", user.getEmail(),
                        "full_name", user.getFullName(),
                        "tenant_name", tenant.getRestaurantName()
                ))
                .build();

        rabbitTemplate.convertAndSend(EXCHANGE, "auth.user.registered", envelope);
        log.debug("Published event auth.user.registered for tenant {}", tenant.getId());
    }

    @Recover
    public void recoverPublishUserRegistered(AmqpException ex, User user, Tenant tenant) {
        log.error("CRITICAL: Event publish failed after 3 retries for key auth.user.registered. Saving to outbox.", ex);
        saveToOutbox(tenant.getId(), "auth.user.registered", Map.of(
                "user_id", user.getId().toString(),
                "email", user.getEmail(),
                "full_name", user.getFullName(),
                "tenant_name", tenant.getRestaurantName()
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishTenantCreated(UUID tenantId) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.tenant.created")
                .tenantId(tenantId)
                .producedBy("auth-service")
                .payload(Map.of("tenant_id", tenantId.toString()))
                .build();

        rabbitTemplate.convertAndSend(EXCHANGE, "auth.tenant.created", envelope);
        log.debug("Published event auth.tenant.created for tenant {}", tenantId);
    }

    @Recover
    public void recoverPublishTenantCreated(AmqpException ex, UUID tenantId) {
        log.error("CRITICAL: Event publish failed after 3 retries for key auth.tenant.created. Saving to outbox.", ex);
        saveToOutbox(tenantId, "auth.tenant.created", Map.of("tenant_id", tenantId.toString()));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishUserInvited(User invitedUser, String inviteToken) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.user.invited")
                .tenantId(invitedUser.getTenantId())
                .producedBy("auth-service")
                .payload(Map.of(
                        "user_id", invitedUser.getId().toString(),
                        "email", invitedUser.getEmail(),
                        "role", invitedUser.getRole().name(),
                        "invite_token", inviteToken
                ))
                .build();

        rabbitTemplate.convertAndSend(EXCHANGE, "auth.user.invited", envelope);
        log.debug("Published event auth.user.invited for tenant {}", invitedUser.getTenantId());
    }

    @Recover
    public void recoverPublishUserInvited(AmqpException ex, User invitedUser, String inviteToken) {
        log.error("CRITICAL: Event publish failed after 3 retries for key auth.user.invited. Saving to outbox.", ex);
        saveToOutbox(invitedUser.getTenantId(), "auth.user.invited", Map.of(
                "user_id", invitedUser.getId().toString(),
                "email", invitedUser.getEmail(),
                "role", invitedUser.getRole().name(),
                "invite_token", inviteToken
        ));
    }

    private void saveToOutbox(UUID tenantId, String routingKey, Map<String, Object> payload) {
        try {
            String json = objectMapper.writeValueAsString(payload);
            outboxEventRepository.save(OutboxEvent.builder()
                    .tenantId(tenantId)
                    .routingKey(routingKey)
                    .payload(json)
                    .failedAt(Instant.now())
                    .build());
        } catch (Exception saveEx) {
            log.error("FATAL: Could not save event to outbox either. Event LOST. Key={}", routingKey, saveEx);
        }
    }
}
