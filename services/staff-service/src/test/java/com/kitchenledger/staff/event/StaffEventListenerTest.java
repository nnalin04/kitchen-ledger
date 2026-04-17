package com.kitchenledger.staff.event;

import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.EmployeeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.Map;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class StaffEventListenerTest {

    @Mock
    private EmployeeRepository employeeRepository;

    @InjectMocks
    private StaffEventListener listener;

    private UUID tenantId;
    private UUID userId;

    @BeforeEach
    void setUp() {
        tenantId = UUID.randomUUID();
        userId   = UUID.randomUUID();
    }

    // ── helpers ─────────────────────────────────────────────────────────────

    private EventEnvelope envelope(String eventType, Map<String, Object> payload) {
        return EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .eventType(eventType)
                .tenantId(tenantId.toString())
                .producedBy("auth-service")
                .version("1.0")
                .payload(payload)
                .build();
    }

    // ── auth.user.registered ─────────────────────────────────────────────────

    @Test
    void onUserRegistered_createsInactiveEmployee() {
        when(employeeRepository.existsByTenantIdAndUserIdAndDeletedAtIsNull(tenantId, userId))
                .thenReturn(false);

        listener.onEvent(envelope("auth.user.registered", Map.of(
                "user_id",   userId.toString(),
                "full_name", "Amit Sharma",
                "email",     "amit@example.com"
        )));

        ArgumentCaptor<Employee> captor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeRepository).save(captor.capture());

        Employee saved = captor.getValue();
        assertThat(saved.getFirstName()).isEqualTo("Amit");
        assertThat(saved.getLastName()).isEqualTo("Sharma");
        assertThat(saved.getUserId()).isEqualTo(userId);
        assertThat(saved.getTenantId()).isEqualTo(tenantId);
        assertThat(saved.isActive()).isFalse();
        assertThat(saved.getRole()).isEqualTo("staff");
        assertThat(saved.getHireDate()).isNotNull();
    }

    @Test
    void onUserRegistered_singleWordName_lastNameEmpty() {
        when(employeeRepository.existsByTenantIdAndUserIdAndDeletedAtIsNull(tenantId, userId))
                .thenReturn(false);

        listener.onEvent(envelope("auth.user.registered", Map.of(
                "user_id",   userId.toString(),
                "full_name", "Ravi"
        )));

        ArgumentCaptor<Employee> captor = ArgumentCaptor.forClass(Employee.class);
        verify(employeeRepository).save(captor.capture());

        Employee saved = captor.getValue();
        assertThat(saved.getFirstName()).isEqualTo("Ravi");
        assertThat(saved.getLastName()).isEmpty();
    }

    @Test
    void onUserRegistered_idempotent_skipsIfEmployeeAlreadyExists() {
        when(employeeRepository.existsByTenantIdAndUserIdAndDeletedAtIsNull(tenantId, userId))
                .thenReturn(true);

        listener.onEvent(envelope("auth.user.registered", Map.of(
                "user_id",   userId.toString(),
                "full_name", "Amit Sharma"
        )));

        verify(employeeRepository, never()).save(any());
    }

    @Test
    void onUserRegistered_missingUserId_skipsWithoutSaving() {
        listener.onEvent(envelope("auth.user.registered", Map.of(
                "full_name", "No Id User"
        )));

        verify(employeeRepository, never()).save(any());
        verify(employeeRepository, never()).existsByTenantIdAndUserIdAndDeletedAtIsNull(any(), any());
    }

    // ── unhandled event types ─────────────────────────────────────────────────

    @Test
    void onUnknownEventType_doesNothing() {
        listener.onEvent(envelope("some.other.event", Map.of("foo", "bar")));

        verify(employeeRepository, never()).save(any());
    }

    @Test
    void onNullEnvelope_doesNotThrow() {
        listener.onEvent(null);
        verify(employeeRepository, never()).save(any());
    }

    @Test
    void onNullEventType_doesNotThrow() {
        listener.onEvent(EventEnvelope.builder()
                .eventId(UUID.randomUUID().toString())
                .tenantId(tenantId.toString())
                .payload(Map.of())
                .build());

        verify(employeeRepository, never()).save(any());
    }
}
