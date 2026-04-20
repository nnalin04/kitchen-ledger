package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.CreateShiftRequest;
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

import java.time.LocalDate;
import java.time.LocalTime;
import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.*;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class ShiftServiceRulesTest {

    @Mock private ShiftRepository shiftRepository;
    @Mock private StaffEventPublisher eventPublisher;
    @InjectMocks private ShiftService shiftService;

    private final UUID TENANT = UUID.randomUUID();
    private final UUID EMP    = UUID.randomUUID();
    private final UUID BY     = UUID.randomUUID();

    // ── Cross-midnight shifts ─────────────────────────────────────────────────

    @Test
    void create_crossMidnightShift_isValid() {
        // 11 PM → 3 AM cross-midnight shift
        CreateShiftRequest req = shiftRequest(LocalTime.of(23, 0), LocalTime.of(3, 0));
        req.setEndsNextDay(true);

        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThatCode(() -> shiftService.create(TENANT, BY, req)).doesNotThrowAnyException();
    }

    @Test
    void create_normalSameDayShift_isValid() {
        CreateShiftRequest req = shiftRequest(LocalTime.of(9, 0), LocalTime.of(17, 0));

        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThatCode(() -> shiftService.create(TENANT, BY, req)).doesNotThrowAnyException();
    }

    @Test
    void create_endTimeBeforeStartWithoutEndsNextDay_throwsValidation() {
        CreateShiftRequest req = shiftRequest(LocalTime.of(23, 0), LocalTime.of(3, 0));
        // endsNextDay not set → invalid (startTime ≥ endTime without flag)

        assertThatThrownBy(() -> shiftService.create(TENANT, BY, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("end_time");
    }

    // ── Clopen prevention ─────────────────────────────────────────────────────

    @Test
    void create_clopenShift_withinMinimumRestGap_throwsValidation() {
        // New shift is on day D. Previous shift ran 22:00→02:00 on day D-1 (ends on day D at 02:00).
        // New shift starts at 08:00 on day D → 6h gap < 8h → clopen violation.
        CreateShiftRequest req = shiftRequest(LocalTime.of(8, 0), LocalTime.of(16, 0));
        LocalDate shiftDate = req.getShiftDate(); // today + 15

        Shift previousShift = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .employeeId(EMP)
                .shiftDate(shiftDate.minusDays(1))   // day D-1
                .startTime(LocalTime.of(22, 0))
                .endTime(LocalTime.of(2, 0))
                .endsNextDay(true)                    // ends on day D at 02:00
                .status(ShiftStatus.scheduled)
                .build();

        when(shiftRepository.findByTenantIdAndEmployeeIdAndShiftDateBetween(
                eq(TENANT), eq(EMP), any(), any()))
                .thenReturn(List.of(previousShift));
        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                any(), any(), any(), any(), any(), any())).thenReturn(false);

        assertThatThrownBy(() -> shiftService.create(TENANT, BY, req))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("rest gap");
    }

    @Test
    void create_sufficientRestGap_isValid() {
        LocalDate shiftDate = LocalDate.now();
        Shift previousShift = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .employeeId(EMP)
                .shiftDate(shiftDate.minusDays(1))
                .startTime(LocalTime.of(18, 0))
                .endTime(LocalTime.of(22, 0))
                .endsNextDay(false)
                .status(ShiftStatus.scheduled)
                .build();

        // Previous shift ends at 22:00, new shift starts at 09:00 next day → 11h gap (> 8h)
        CreateShiftRequest req = shiftRequest(LocalTime.of(9, 0), LocalTime.of(17, 0));

        when(shiftRepository.findByTenantIdAndEmployeeIdAndShiftDateBetween(
                eq(TENANT), eq(EMP), any(), any()))
                .thenReturn(List.of(previousShift));
        when(shiftRepository.existsByTenantIdAndEmployeeIdAndShiftDateAndStatusNotAndStartTimeLessThanAndEndTimeGreaterThan(
                any(), any(), any(), any(), any(), any())).thenReturn(false);
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        assertThatCode(() -> shiftService.create(TENANT, BY, req)).doesNotThrowAnyException();
    }

    // ── 14-day publish window ─────────────────────────────────────────────────

    @Test
    void publish_shiftsStartingWithin14Days_throwsValidationException() {
        // Shift date is today + 5 days (inside 14-day window)
        LocalDate from = LocalDate.now().plusDays(3);
        LocalDate to   = LocalDate.now().plusDays(5);

        // publish() throws before querying the repository — no stub needed
        assertThatThrownBy(() -> shiftService.publish(TENANT, from, to))
                .isInstanceOf(ValidationException.class)
                .hasMessageContaining("14 days");
    }

    @Test
    void publish_shiftsStarting14OrMoreDaysAhead_succeeds() {
        LocalDate from = LocalDate.now().plusDays(14);
        LocalDate to   = LocalDate.now().plusDays(21);

        Shift shift = Shift.builder()
                .id(UUID.randomUUID())
                .tenantId(TENANT)
                .shiftDate(from)
                .status(ShiftStatus.scheduled)
                .startTime(LocalTime.of(9, 0))
                .endTime(LocalTime.of(17, 0))
                .build();

        when(shiftRepository.findByTenantIdAndShiftDateBetweenOrderByShiftDateAscStartTimeAsc(TENANT, from, to))
                .thenReturn(List.of(shift));
        when(shiftRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        int published = shiftService.publish(TENANT, from, to);

        assertThat(published).isEqualTo(1);
        assertThat(shift.getStatus()).isEqualTo(ShiftStatus.published);
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private CreateShiftRequest shiftRequest(LocalTime start, LocalTime end) {
        CreateShiftRequest req = new CreateShiftRequest();
        req.setEmployeeId(EMP);
        req.setShiftDate(LocalDate.now().plusDays(15));
        req.setStartTime(start);
        req.setEndTime(end);
        req.setRoleLabel("server");
        return req;
    }
}
