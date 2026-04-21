package com.kitchenledger.auth.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.kitchenledger.auth.model.Tenant;
import com.kitchenledger.auth.model.User;
import com.kitchenledger.auth.model.enums.UserRole;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.amqp.rabbit.core.RabbitTemplate;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.verify;

@ExtendWith(MockitoExtension.class)
class AuthEventPublisherTest {

    @Mock RabbitTemplate rabbitTemplate;
    @Mock OutboxEventRepository outboxEventRepository;

    @InjectMocks AuthEventPublisher publisher;

    private ObjectMapper objectMapper;

    @BeforeEach
    void setUp() {
        objectMapper = new ObjectMapper();
        // inject the real ObjectMapper via reflection
        org.springframework.test.util.ReflectionTestUtils.setField(publisher, "objectMapper", objectMapper);
    }

    // ── publishUserInvited — security invariant ───────────────────────────────

    @Test
    void publishUserInvited_doesNotIncludeRawToken() {
        User invitedUser = User.builder()
                .id(UUID.randomUUID())
                .tenantId(UUID.randomUUID())
                .email("staff@spicegarden.com")
                .fullName("Priya Singh")
                .role(UserRole.kitchen_staff)
                .build();

        publisher.publishUserInvited(invitedUser, "Spice Garden");

        ArgumentCaptor<EventEnvelope> captor = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(rabbitTemplate).convertAndSend(anyString(), eq("auth.user.invited"), captor.capture());

        Map<String, Object> payload = captor.getValue().getPayload();

        assertThat(payload).doesNotContainKey("invite_token");
        assertThat(payload).doesNotContainKey("inviteToken");
        assertThat(payload).doesNotContainKey("raw_token");
        assertThat(payload).doesNotContainKey("token");
    }

    @Test
    void publishUserInvited_includesExpectedFields() {
        UUID userId   = UUID.randomUUID();
        UUID tenantId = UUID.randomUUID();

        User invitedUser = User.builder()
                .id(userId)
                .tenantId(tenantId)
                .email("staff@spicegarden.com")
                .fullName("Priya Singh")
                .role(UserRole.kitchen_staff)
                .build();

        publisher.publishUserInvited(invitedUser, "Spice Garden");

        ArgumentCaptor<EventEnvelope> captor = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(rabbitTemplate).convertAndSend(anyString(), eq("auth.user.invited"), captor.capture());

        Map<String, Object> payload = captor.getValue().getPayload();

        assertThat(payload).containsEntry("user_id",     userId.toString());
        assertThat(payload).containsEntry("email",       "staff@spicegarden.com");
        assertThat(payload).containsEntry("full_name",   "Priya Singh");
        assertThat(payload).containsEntry("role",        "kitchen_staff");
        assertThat(payload).containsEntry("tenant_name", "Spice Garden");
    }

    // ── publishUserRegistered — baseline sanity ───────────────────────────────

    @Test
    void publishUserRegistered_includesUserAndTenantFields() {
        UUID tenantId = UUID.randomUUID();
        User user = User.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .email("owner@spicegarden.com")
                .fullName("Ravi Kumar")
                .role(UserRole.owner)
                .build();
        Tenant tenant = Tenant.builder()
                .id(tenantId)
                .restaurantName("Spice Garden")
                .build();

        publisher.publishUserRegistered(user, tenant);

        ArgumentCaptor<EventEnvelope> captor = ArgumentCaptor.forClass(EventEnvelope.class);
        verify(rabbitTemplate).convertAndSend(anyString(), eq("auth.user.registered"), captor.capture());

        Map<String, Object> payload = captor.getValue().getPayload();
        assertThat(payload).containsKey("user_id");
        assertThat(payload).containsKey("email");
        assertThat(payload).doesNotContainKey("invite_token");
    }
}
