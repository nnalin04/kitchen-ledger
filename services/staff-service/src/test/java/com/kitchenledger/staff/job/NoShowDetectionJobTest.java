package com.kitchenledger.staff.job;

import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.model.Shift;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import com.kitchenledger.staff.repository.ShiftRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageImpl;
import org.springframework.data.domain.Pageable;

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.ArrayList;
import java.util.Collections;
import java.util.List;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class NoShowDetectionJobTest {

    @Mock private ShiftRepository      shiftRepository;
    @Mock private AttendanceRepository attendanceRepository;
    @Mock private EmployeeRepository   employeeRepository;
    @Mock private StaffEventPublisher  eventPublisher;

    @InjectMocks private NoShowDetectionJob job;

    private UUID tenantId;
    private UUID employeeId;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
    }

    // ── No-clock-in past threshold → marked no_show + event fired ────────────

    @Test
    void detectNoShows_noClockin_marksNoShowAndPublishesEvent() {
        Shift shift = overdueShift(ShiftStatus.scheduled);

        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(pageOf(List.of(shift)))
                .thenReturn(emptyPage());
        when(attendanceRepository.existsByShiftIdAndTenantId(shift.getId(), tenantId))
                .thenReturn(false);
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(employee("Jane", "Doe")));
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        job.detectNoShows();

        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.no_show);
        verify(shiftRepository).save(shift);
        verify(eventPublisher).publishEmployeeNoShow(
                eq(tenantId), eq(shift.getId()), eq(employeeId),
                eq("Jane Doe"), any(), any());
    }

    // ── Clocked-in shift → not marked ────────────────────────────────────────

    @Test
    void detectNoShows_hasClockin_doesNotMarkNoShow() {
        Shift shift = overdueShift(ShiftStatus.published);

        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(pageOf(List.of(shift)))
                .thenReturn(emptyPage());
        when(attendanceRepository.existsByShiftIdAndTenantId(shift.getId(), tenantId))
                .thenReturn(true);

        job.detectNoShows();

        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.published);
        verify(shiftRepository, never()).save(any());
        verify(eventPublisher, never()).publishEmployeeNoShow(any(), any(), any(), any(), any(), any());
    }

    // ── Already no_show → not re-processed ───────────────────────────────────

    @Test
    void detectNoShows_alreadyNoShow_notRetriggered() {
        // Job filters by scheduled/published/confirmed — no_show shifts are never returned
        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(emptyPage());

        job.detectNoShows();

        verifyNoInteractions(attendanceRepository, eventPublisher);
    }

    // ── No overdue shifts → no writes, no events ─────────────────────────────

    @Test
    void detectNoShows_noOverdueShifts_noSideEffects() {
        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(emptyPage());

        job.detectNoShows();

        verify(shiftRepository, never()).save(any());
        verifyNoInteractions(attendanceRepository, eventPublisher);
    }

    // ── Unknown employee → uses fallback name, event still fires ─────────────

    @Test
    void detectNoShows_employeeNotFound_usesFallbackName() {
        Shift shift = overdueShift(ShiftStatus.confirmed);

        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(pageOf(List.of(shift)))
                .thenReturn(emptyPage());
        when(attendanceRepository.existsByShiftIdAndTenantId(shift.getId(), tenantId))
                .thenReturn(false);
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.empty());
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        job.detectNoShows();

        verify(eventPublisher).publishEmployeeNoShow(
                eq(tenantId), eq(shift.getId()), eq(employeeId),
                eq("Unknown Employee"), any(), any());
    }

    // ── Per-tenant isolation ──────────────────────────────────────────────────

    @Test
    void shouldContinueProcessingRemainingBatchesWhenOneFails() {
        UUID tenant2   = UUID.randomUUID();
        UUID employee2 = UUID.randomUUID();

        Shift shift1 = overdueShift(ShiftStatus.scheduled);
        Shift shift2 = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(tenant2)
                .employeeId(employee2)
                .shiftDate(LocalDate.now())
                .startTime(LocalTime.now().minusMinutes(30))
                .endTime(LocalTime.now().plusHours(4))
                .status(ShiftStatus.scheduled)
                .build();
        Shift shift3 = overdueShift(ShiftStatus.scheduled);

        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(pageOf(List.of(shift1, shift2, shift3)))
                .thenReturn(emptyPage());

        when(attendanceRepository.existsByShiftIdAndTenantId(shift1.getId(), tenantId))
                .thenReturn(false);
        when(attendanceRepository.existsByShiftIdAndTenantId(shift2.getId(), tenant2))
                .thenThrow(new RuntimeException("simulated failure"));
        when(attendanceRepository.existsByShiftIdAndTenantId(shift3.getId(), tenantId))
                .thenReturn(false);

        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(shift1.getEmployeeId(), tenantId))
                .thenReturn(Optional.of(employee("Alice", "Smith")));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(shift3.getEmployeeId(), tenantId))
                .thenReturn(Optional.of(employee("Bob", "Jones")));
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        // Must not throw — job isolates per-shift failures
        job.detectNoShows();

        // shift1 and shift3 processed despite shift2 failing
        verify(attendanceRepository).existsByShiftIdAndTenantId(shift1.getId(), tenantId);
        verify(attendanceRepository).existsByShiftIdAndTenantId(shift2.getId(), tenant2);
        verify(attendanceRepository).existsByShiftIdAndTenantId(shift3.getId(), tenantId);
        verify(eventPublisher, times(2)).publishEmployeeNoShow(any(), any(), any(), any(), any(), any());
    }

    // ── Batched loading: 150 shifts across 2 pages ────────────────────────────

    @Test
    void shouldProcessShiftsInBatchesOf100() {
        // Build 100 shifts for page 0 and 50 shifts for page 1
        List<Shift> page0Shifts = buildShifts(100);
        List<Shift> page1Shifts = buildShifts(50);

        when(shiftRepository.findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class)))
                .thenReturn(pageOf(page0Shifts))   // first call  — 100 items
                .thenReturn(pageOf(page1Shifts))   // second call — 50 items  (< 100 → stop)
                .thenReturn(emptyPage());           // third call  — empty     (should not be reached)

        // All shifts have no attendance record → each triggers a no-show
        when(attendanceRepository.existsByShiftIdAndTenantId(any(), any()))
                .thenReturn(false);
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(any(), any()))
                .thenReturn(Optional.of(employee("Test", "Employee")));
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        job.detectNoShows();

        // Repository must be called exactly twice: page 0 (100 items) then page 1 (50 items).
        // The loop exits after page 1 because its size < 100, so no third call.
        verify(shiftRepository, times(2)).findByStatusInAndShiftDateAndStartTimeBefore(
                anyList(), any(), any(), any(Pageable.class));

        // All 150 shifts must have been processed (each triggers one event publish)
        verify(eventPublisher, times(150)).publishEmployeeNoShow(
                any(), any(), any(), any(), any(), any());
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private Shift overdueShift(ShiftStatus status) {
        return Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .shiftDate(LocalDate.now())
                .startTime(LocalTime.now().minusMinutes(30))
                .endTime(LocalTime.now().plusHours(4))
                .status(status)
                .build();
    }

    private List<Shift> buildShifts(int count) {
        List<Shift> shifts = new ArrayList<>(count);
        for (int i = 0; i < count; i++) {
            shifts.add(Shift.builder()
                    .id(UUID.randomUUID())
                    .tenantId(tenantId)
                    .employeeId(employeeId)
                    .shiftDate(LocalDate.now())
                    .startTime(LocalTime.now().minusMinutes(30))
                    .endTime(LocalTime.now().plusHours(4))
                    .status(ShiftStatus.scheduled)
                    .build());
        }
        return shifts;
    }

    private Employee employee(String first, String last) {
        return Employee.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .userId(UUID.randomUUID())
                .firstName(first)
                .lastName(last)
                .role("kitchen_staff")
                .build();
    }

    private static <T> Page<T> pageOf(List<T> content) {
        return new PageImpl<>(content);
    }

    private static <T> Page<T> emptyPage() {
        return new PageImpl<>(Collections.emptyList());
    }
}
