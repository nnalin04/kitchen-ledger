package com.kitchenledger.staff.event;

import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.enums.EmploymentType;
import com.kitchenledger.staff.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.amqp.rabbit.annotation.RabbitListener;
import org.springframework.stereotype.Component;

import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

/**
 * Consumes events from the staff-service RabbitMQ queue.
 *
 * Handled events:
 *   auth.user.registered → create an inactive placeholder Employee linked to the new user.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class StaffEventListener {

    private final EmployeeRepository employeeRepository;

    @RabbitListener(queues = "${rabbitmq.queues.staff-service:staff-service}")
    public void onEvent(EventEnvelope envelope) {
        if (envelope == null || envelope.getEventType() == null) return;

        switch (envelope.getEventType()) {
            case "auth.user.registered" -> handleUserRegistered(envelope);
            default -> log.debug("StaffEventListener: unhandled event type '{}'", envelope.getEventType());
        }
    }

    /**
     * When a new user registers, create an inactive Employee placeholder so the
     * manager can complete onboarding (hire date, role, rate) in the Staff module.
     *
     * Payload fields: user_id, email, full_name, tenant_name
     */
    private void handleUserRegistered(EventEnvelope envelope) {
        Map<String, Object> payload = envelope.getPayload();
        if (payload == null) return;

        String userIdStr = (String) payload.get("user_id");
        if (userIdStr == null) {
            log.warn("StaffEventListener: auth.user.registered missing user_id, skipping");
            return;
        }

        UUID userId    = UUID.fromString(userIdStr);
        UUID tenantId  = UUID.fromString(envelope.getTenantId());

        // Idempotency: skip if an employee record already exists for this user
        if (employeeRepository.existsByTenantIdAndUserIdAndDeletedAtIsNull(tenantId, userId)) {
            log.debug("StaffEventListener: employee already exists for user {}, skipping", userId);
            return;
        }

        String fullName = (String) payload.getOrDefault("full_name", "Unknown");
        String[] parts  = fullName.split(" ", 2);
        String firstName = parts[0];
        String lastName  = parts.length > 1 ? parts[1] : "";

        Employee emp = Employee.builder()
                .tenantId(tenantId)
                .userId(userId)
                .firstName(firstName)
                .lastName(lastName)
                .role("staff")                        // default; manager updates later
                .employmentType(EmploymentType.full_time)
                .hireDate(LocalDate.now())            // placeholder; manager updates
                .active(false)                        // inactive until manager completes onboarding
                .build();

        employeeRepository.save(emp);
        log.info("StaffEventListener: created placeholder employee for user {} in tenant {}", userId, tenantId);
    }
}
