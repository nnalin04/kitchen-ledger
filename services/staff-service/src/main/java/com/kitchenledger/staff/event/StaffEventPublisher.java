package com.kitchenledger.staff.event;

import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class StaffEventPublisher {

    private final RabbitTemplate rabbitTemplate;

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    public void publishEmployeeHired(UUID tenantId, UUID employeeId, String fullName, String role) {
        publish(tenantId, "staff.employee.hired", Map.of(
                "employee_id", employeeId.toString(),
                "full_name",   fullName,
                "role",        role
        ));
    }

    public void publishShiftCreated(UUID tenantId, UUID shiftId, UUID employeeId, String shiftDate) {
        publish(tenantId, "staff.shift.created", Map.of(
                "shift_id",    shiftId.toString(),
                "employee_id", employeeId.toString(),
                "shift_date",  shiftDate
        ));
    }

    private void publish(UUID tenantId, String eventType, Map<String, Object> payload) {
        try {
            EventEnvelope envelope = EventEnvelope.builder()
                    .eventId(UUID.randomUUID().toString())
                    .eventType(eventType)
                    .tenantId(tenantId.toString())
                    .producedBy("staff-service")
                    .producedAt(Instant.now().toString())
                    .version("1.0")
                    .payload(payload)
                    .build();
            rabbitTemplate.convertAndSend(exchange, eventType, envelope);
        } catch (Exception e) {
            log.error("Failed to publish event {} for tenant {}: {}", eventType, tenantId, e.getMessage());
        }
    }
}
