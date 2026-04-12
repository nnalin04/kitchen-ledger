package com.kitchenledger.auth.event;

import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.model.User;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.stereotype.Component;

import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class AuthEventPublisher {

    private static final String EXCHANGE = "kitchenledger.events";

    private final RabbitTemplate rabbitTemplate;

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

        publish("auth.user.registered", envelope);
    }

    public void publishTenantCreated(UUID tenantId) {
        EventEnvelope envelope = EventEnvelope.builder()
                .eventType("auth.tenant.created")
                .tenantId(tenantId)
                .producedBy("auth-service")
                .payload(Map.of("tenant_id", tenantId.toString()))
                .build();

        publish("auth.tenant.created", envelope);
    }

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

        publish("auth.user.invited", envelope);
    }

    private void publish(String routingKey, EventEnvelope envelope) {
        try {
            rabbitTemplate.convertAndSend(EXCHANGE, routingKey, envelope);
            log.debug("Published event {} for tenant {}", envelope.getEventType(), envelope.getTenantId());
        } catch (Exception e) {
            // Log but don't fail the request — events are best-effort for now
            log.error("Failed to publish event {}: {}", envelope.getEventType(), e.getMessage());
        }
    }
}
