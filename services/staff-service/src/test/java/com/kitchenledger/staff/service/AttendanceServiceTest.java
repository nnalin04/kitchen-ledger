package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.ClockInRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.Instant;
import java.util.Optional;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.*;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AttendanceServiceTest {

    @Mock private AttendanceRepository attendanceRepository;
    @Mock private EmployeeRepository   employeeRepository;
    @Mock private StaffEventPublisher  eventPublisher;

    @InjectMocks private AttendanceService attendanceService;

    private UUID tenantId;
    private UUID employeeId;
    private UUID recordedBy;

    @BeforeEach
    void setUp() {
        tenantId   = UUID.randomUUID();
        employeeId = UUID.randomUUID();
        recordedBy = UUID.randomUUID();
    }

    @Test
    void testClockIn_setsClockInTime() {
        ClockInRequest req = new ClockInRequest();
        req.setEmployeeId(employeeId);

        Attendance saved = Attendance.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .clockInAt(Instant.now())
                .recordedBy(recordedBy)
                .build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.empty());
        when(attendanceRepository.save(any(Attendance.class))).thenReturn(saved);

        Attendance result = attendanceService.clockIn(tenantId, recordedBy, req);

        assertThat(result.getId()).isNotNull();
        assertThat(result.getClockInAt()).isNotNull();
        assertThat(result.getClockOutAt()).isNull();
        verify(attendanceRepository).save(any(Attendance.class));
    }

    @Test
    void testClockIn_alreadyClockedIn_throwsConflictException() {
        ClockInRequest req = new ClockInRequest();
        req.setEmployeeId(employeeId);

        Attendance existing = Attendance.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .clockInAt(Instant.now().minus(Duration.ofHours(2)))
                .recordedBy(recordedBy)
                .build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.of(existing));

        assertThatThrownBy(() -> attendanceService.clockIn(tenantId, recordedBy, req))
                .isInstanceOf(ConflictException.class)
                .hasMessageContaining("already clocked in");
    }

    @Test
    void testClockOut_calculatesHoursWorked() {
        // Set clock-in 4 hours ago to verify hours calculation
        Instant clockIn = Instant.now().minus(Duration.ofHours(4));

        Attendance openAttendance = Attendance.builder()
                .id(UUID.randomUUID())
                .tenantId(tenantId)
                .employeeId(employeeId)
                .clockInAt(clockIn)
                .recordedBy(recordedBy)
                .build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.of(openAttendance));
        // sumHoursWorked used by overtime check — return below warning threshold
        when(attendanceRepository.sumHoursWorked(eq(tenantId), eq(employeeId), any(), any()))
                .thenReturn(new BigDecimal("4.00"));
        when(attendanceRepository.save(any(Attendance.class))).thenAnswer(inv -> inv.getArgument(0));

        Attendance result = attendanceService.clockOut(tenantId, employeeId);

        assertThat(result.getClockOutAt()).isNotNull();
        assertThat(result.getHoursWorked()).isNotNull();
        // Allow ±0.1h tolerance since Instant.now() is used inside the service
        assertThat(result.getHoursWorked()).isBetween(new BigDecimal("3.9"), new BigDecimal("4.1"));
    }

    @Test
    void testClockOut_exactlyAt40Hours_calculatesNoOvertime() {
        Instant clockIn = Instant.now().minus(Duration.ofHours(8));

        Attendance openAttendance = Attendance.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).employeeId(employeeId)
                .clockInAt(clockIn).recordedBy(recordedBy).build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.of(openAttendance));
        // Exactly 40h this week — above threshold, so warning condition is false (40 < 40 is false)
        when(attendanceRepository.sumHoursWorked(eq(tenantId), eq(employeeId), any(), any()))
                .thenReturn(new BigDecimal("40.00"));
        when(attendanceRepository.save(any(Attendance.class))).thenAnswer(inv -> inv.getArgument(0));

        attendanceService.clockOut(tenantId, employeeId);

        // At exactly 40h the overtime warning is NOT triggered (threshold is [36, 40))
        verify(eventPublisher, never()).publishOvertimeApproaching(any(), any(), anyString(), anyDouble());
    }

    @Test
    void testClockOut_at36to40Hours_firesOvertimeApproachingEvent() {
        Instant clockIn = Instant.now().minus(Duration.ofHours(8));

        Attendance openAttendance = Attendance.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).employeeId(employeeId)
                .clockInAt(clockIn).recordedBy(recordedBy).build();

        Employee emp = Employee.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).userId(recordedBy)
                .firstName("Jane").lastName("Doe").role("server").build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.of(openAttendance));
        // 37h this week — falls in [36, 40) → overtime warning fires
        when(attendanceRepository.sumHoursWorked(eq(tenantId), eq(employeeId), any(), any()))
                .thenReturn(new BigDecimal("37.00"));
        when(attendanceRepository.save(any(Attendance.class))).thenAnswer(inv -> inv.getArgument(0));
        when(employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId))
                .thenReturn(Optional.of(emp));

        attendanceService.clockOut(tenantId, employeeId);

        verify(eventPublisher).publishOvertimeApproaching(eq(tenantId), eq(employeeId), anyString(), anyDouble());
    }

    @Test
    void testClockOut_crossesMidnight_calculatesCorrectDuration() {
        // Simulate a 2-hour shift by setting clockInAt 2 hours in the past
        // This verifies duration math works regardless of wall clock time (e.g., midnight)
        Instant clockIn = Instant.now().minus(Duration.ofMinutes(120));

        Attendance openAttendance = Attendance.builder()
                .id(UUID.randomUUID()).tenantId(tenantId).employeeId(employeeId)
                .clockInAt(clockIn).recordedBy(recordedBy).build();

        when(attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId))
                .thenReturn(Optional.of(openAttendance));
        when(attendanceRepository.sumHoursWorked(eq(tenantId), eq(employeeId), any(), any()))
                .thenReturn(new BigDecimal("2.00"));
        when(attendanceRepository.save(any(Attendance.class))).thenAnswer(inv -> inv.getArgument(0));

        Attendance result = attendanceService.clockOut(tenantId, employeeId);

        assertThat(result.getHoursWorked()).isBetween(new BigDecimal("1.9"), new BigDecimal("2.1"));
    }
}
