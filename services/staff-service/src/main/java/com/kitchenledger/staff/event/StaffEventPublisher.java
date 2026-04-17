package com.kitchenledger.staff.event;

import com.fasterxml.jackson.databind.ObjectMapper;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.AmqpException;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.retry.annotation.Backoff;
import org.springframework.retry.annotation.Recover;
import org.springframework.retry.annotation.Retryable;
import org.springframework.stereotype.Component;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Map;
import java.util.UUID;

@Component
@RequiredArgsConstructor
@Slf4j
public class StaffEventPublisher {

    private final RabbitTemplate rabbitTemplate;
    private final OutboxEventRepository outboxEventRepository;
    private final ObjectMapper objectMapper;

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchange;

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishEmployeeHired(UUID tenantId, UUID employeeId, String fullName, String role) {
        Map<String, Object> payload = Map.of(
                "employee_id", employeeId.toString(),
                "full_name",   fullName,
                "role",        role
        );
        publishEnvelope(tenantId, "staff.employee.hired", payload);
    }

    @Recover
    public void recoverPublishEmployeeHired(AmqpException ex, UUID tenantId, UUID employeeId,
                                             String fullName, String role) {
        log.error("CRITICAL: Event publish failed after 3 retries for key staff.employee.hired. Saving to outbox.", ex);
        saveToOutbox(tenantId, "staff.employee.hired", Map.of(
                "employee_id", employeeId.toString(),
                "full_name",   fullName,
                "role",        role
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishShiftCreated(UUID tenantId, UUID shiftId, UUID employeeId, String shiftDate) {
        Map<String, Object> payload = Map.of(
                "shift_id",    shiftId.toString(),
                "employee_id", employeeId.toString(),
                "shift_date",  shiftDate
        );
        publishEnvelope(tenantId, "staff.shift.created", payload);
    }

    @Recover
    public void recoverPublishShiftCreated(AmqpException ex, UUID tenantId, UUID shiftId,
                                            UUID employeeId, String shiftDate) {
        log.error("CRITICAL: Event publish failed after 3 retries for key staff.shift.created. Saving to outbox.", ex);
        saveToOutbox(tenantId, "staff.shift.created", Map.of(
                "shift_id",    shiftId.toString(),
                "employee_id", employeeId.toString(),
                "shift_date",  shiftDate
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishEmployeeNoShow(UUID tenantId, UUID shiftId, UUID employeeId,
                                      String employeeName, LocalDate shiftDate, LocalTime shiftStart) {
        Map<String, Object> payload = Map.of(
                "shift_id",       shiftId.toString(),
                "employee_id",    employeeId.toString(),
                "employee_name",  employeeName,
                "shift_date",     shiftDate.toString(),
                "shift_start",    shiftStart.toString()
        );
        publishEnvelope(tenantId, "staff.employee.noshow", payload);
    }

    @Recover
    public void recoverPublishEmployeeNoShow(AmqpException ex, UUID tenantId, UUID shiftId,
                                              UUID employeeId, String employeeName,
                                              LocalDate shiftDate, LocalTime shiftStart) {
        log.error("CRITICAL: Event publish failed after 3 retries for key staff.employee.noshow. Saving to outbox.", ex);
        saveToOutbox(tenantId, "staff.employee.noshow", Map.of(
                "shift_id",      shiftId.toString(),
                "employee_id",   employeeId.toString(),
                "employee_name", employeeName,
                "shift_date",    shiftDate.toString(),
                "shift_start",   shiftStart.toString()
        ));
    }

    @Retryable(
        retryFor = AmqpException.class,
        maxAttempts = 3,
        backoff = @Backoff(delay = 1000, multiplier = 2.0, maxDelay = 10000)
    )
    public void publishOvertimeApproaching(UUID tenantId, UUID employeeId,
                                           String employeeName, double hoursThisWeek) {
        double hoursUntilOvertime = Math.max(0, 40.0 - hoursThisWeek);
        Map<String, Object> payload = Map.of(
                "employee_id",          employeeId.toString(),
                "employee_name",        employeeName,
                "hours_this_week",      String.valueOf(hoursThisWeek),
                "hours_until_overtime", String.valueOf(hoursUntilOvertime)
        );
        publishEnvelope(tenantId, "staff.overtime.approaching", payload);
    }

    @Recover
    public void recoverPublishOvertimeApproaching(AmqpException ex, UUID tenantId, UUID employeeId,
                                                   String employeeName, double hoursThisWeek) {
        log.error("CRITICAL: Event publish failed after 3 retries for key staff.overtime.approaching. Saving to outbox.", ex);
        saveToOutbox(tenantId, "staff.overtime.approaching", Map.of(
                "employee_id",     employeeId.toString(),
                "employee_name",   employeeName,
                "hours_this_week", String.valueOf(hoursThisWeek)
        ));
    }

    private void publishEnvelope(UUID tenantId, String eventType, Map<String, Object> payload) {
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
        log.debug("Published event: {} for tenant {}", eventType, tenantId);
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
