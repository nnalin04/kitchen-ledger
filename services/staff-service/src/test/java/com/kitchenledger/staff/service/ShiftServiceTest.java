package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateShiftRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.ShiftRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShiftServiceTest {

    @Mock private ShiftRepository shiftRepository;
    @Mock private StaffEventPublisher eventPublisher;

    @InjectMocks private ShiftService shiftService;

    private UUID tenantId;
    private UUID employeeId;
    private UUID createdBy;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        createdBy  = UUID.randomUUID();
    }

    @Test
    void testCreate_validShift_saves() {
        CreateShiftRequest req = new CreateShiftRequest();
        req.setEmployeeId(employeeId);
        req.setShiftDate(LocalDate.now().plusDays(1));
        req.setStartTime(LocalTime.of(9, 0));
        req.setEndTime(LocalTime.of(17, 0));
        req.setRoleLabel("server");

        Shift saved = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .shiftDate(req.getShiftDate())
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.scheduled)
                .createdBy(createdBy)
                .build();

        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(shiftRepository.save(any(Shift.class))).thenReturn(saved);

        Shift result = shiftService.create(tenantId, createdBy, req);

        assertThat(result.getId()).isNotNull();
        assertThat(result.getStatus()).isEqualTo(ShiftStatus.scheduled);
        verify(eventPublisher).publishShiftCreated(eq(tenantId), any(), eq(employeeId), anyString());
    }

    @Test
    void testCreate_overlappingShift_sameEmployee_throwsValidationException() {
        CreateShiftRequest req = new CreateShiftRequest();
        req.setEmployeeId(employeeId);
        req.setShiftDate(LocalDate.now().plusDays(1));
        req.setStartTime(LocalTime.of(9, 0));
        req.setEndTime(LocalTime.of(17, 0));

        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                eq(tenantId), eq(employeeId), any(LocalDate.class),
                eq(ShiftStatus.cancelled),
                eq(LocalTime.of(17, 0)), eq(LocalTime.of(9, 0))
        )).thenReturn(true);

        assertThatThrownBy(() -> shiftService.create(tenantId, createdBy, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("overlapping shift");
    }

    @Test
    void testCreate_clopenShift_throwsValidationException() {
        // Clopen: close at 23:00, open next at 07:00 — end before start on same day
        CreateShiftRequest req = new CreateShiftRequest();
        req.setEmployeeId(employeeId);
        req.setShiftDate(LocalDate.now().plusDays(1));
        req.setStartTime(LocalTime.of(23, 0));
        req.setEndTime(LocalTime.of(7, 0));  // endTime < startTime → invalid

        assertThatThrownBy(() -> shiftService.create(tenantId, createdBy, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("start_time must be before end_time");
    }

    @Test
    void testPublish_scheduledShifts_transitionsToPublished() {
        LocalDate from = LocalDate.now().plusWeeks(2);
        LocalDate to   = from.plusDays(6);

        Shift s1 = Shift.builder().id(UUID.randomUUID()).tenantId(tenantId)
                .employeeId(employeeId).shiftDate(from)
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.scheduled).createdBy(createdBy).build();
        Shift s2 = Shift.builder().id(UUID.randomUUID()).tenantId(tenantId)
                .employeeId(employeeId).shiftDate(from.plusDays(1))
                .startTime(LocalTime.of(9, 0)).endTime(LocalTime.of(17, 0))
                .status(ShiftStatus.cancelled).createdBy(createdBy).build();

        when(shiftRepository.findByTenantIdAndShiftDateBetweenOrderByShiftDateAscStartTimeAsc(
                tenantId, from, to)).thenReturn(List.of(s1, s2));
        when(shiftRepository.save(any(Shift.class))).thenAnswer(inv -> inv.getArgument(0));

        int published = shiftService.publish(tenantId, from, to);

        // Only the scheduled shift should be transitioned
        assertThat(published).isEqualTo(1);
        ArgumentCaptor<Shift> captor = ArgumentCaptor.forClass(Shift.class);
        verify(shiftRepository, times(1)).save(captor.capture());
        assertThat(captor.getValue().getStatus()).isEqualTo(ShiftStatus.published);
    }

    @Test
    void testDelete_publishedShift_throwsValidationException() {
        UUID shiftId = UUID.randomUUID();
        Shift published = Shift.builder()
                .id(shiftId).tenantId(tenantId).employeeId(employeeId)
                .shiftDate(LocalDate.now()).startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0)).status(ShiftStatus.published)
                .createdBy(createdBy).build();

        when(shiftRepository.findByIdAndTenantId(shiftId, tenantId))
                .thenReturn(Optional.of(published));

        assertThatThrownBy(() -> shiftService.delete(tenantId, shiftId))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("Cannot delete a published or confirmed shift");
    }
}
