package com.kitchenledger.staff.service;

import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.ShiftRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.Instant;
import java.time.LocalDate;
import java.time.LocalTime;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShiftServiceSoftDeleteTest {

    @Mock private ShiftRepository shiftRepository;
    @Mock private StaffEventPublisher eventPublisher;
    @InjectMocks private ShiftService shiftService;

    private final UUID TENANT = UUID.randomUUID();

    // ── Soft delete ───────────────────────────────────────────────────────────

    @Test
    void delete_scheduledShift_setsDeletedAtInsteadOfHardDelete() {
        Shift shift = scheduledShift();

        when(shiftRepository.findByIdAndTenantId(shift.getId(), TENANT))
                .thenReturn(Optional.of(shift));
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        shiftService.delete(TENANT, shift.getId());

        // Hard delete must NOT be called
        verify(shiftRepository, never()).delete(any(Shift.class));
        // Soft delete must set deletedAt
        assertThat(shift.getDeletedAt()).isNotNull();
        verify(shiftRepository).save(shift);
    }

    @Test
    void delete_publishedShift_throwsValidation() {
        Shift shift = scheduledShift();
        shift.setStatus(ShiftStatus.published);

        when(shiftRepository.findByIdAndTenantId(shift.getId(), TENANT))
                .thenReturn(Optional.of(shift));

        assertThatThrownBy(() -> shiftService.delete(TENANT, shift.getId()))
                .isInstanceOf(ValidationException.class);
    }

    @Test
    void delete_confirmedShift_throwsValidation() {
        Shift shift = scheduledShift();
        shift.setStatus(ShiftStatus.confirmed);

        when(shiftRepository.findByIdAndTenantId(shift.getId(), TENANT))
                .thenReturn(Optional.of(shift));

        assertThatThrownBy(() -> shiftService.delete(TENANT, shift.getId()));
    }

    @Test
    void shiftEntity_hasDeletedAtField() {
        Shift shift = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .employeeId(UUID.randomUUID())
                .shiftDate(LocalDate.now())
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .createdBy(UUID.randomUUID())
                .build();

        assertThat(shift.getDeletedAt()).isNull(); // not set by default
        shift.setDeletedAt(Instant.now());
        assertThat(shift.getDeletedAt()).isNotNull();
    }

    // ── helper ────────────────────────────────────────────────────────────────

    private Shift scheduledShift() {
        return Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .employeeId(UUID.randomUUID())
                .shiftDate(LocalDate.now().plusDays(15))
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.scheduled)
                .createdBy(UUID.randomUUID())
                .build();
    }
}
