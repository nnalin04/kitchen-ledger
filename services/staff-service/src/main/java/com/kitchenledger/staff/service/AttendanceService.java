package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.ClockInRequest;
import com.kitchenledger.staff.event.StaffEventPublisher;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZonedDateTime;
import java.time.temporal.TemporalAdjusters;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
@Slf4j
public class AttendanceService {

    private static final BigDecimal OVERTIME_WARNING_HOURS = new BigDecimal("36.0");
    private static final BigDecimal OVERTIME_THRESHOLD      = new BigDecimal("40.0");

    private final AttendanceRepository attendanceRepository;
    private final EmployeeRepository   employeeRepository;
    private final StaffEventPublisher  eventPublisher;

    @Transactional(readOnly = true)
    public Page<Attendance> list(UUID tenantId, Pageable pageable) {
        return attendanceRepository.findByTenantIdOrderByClockInAtDesc(tenantId, pageable);
    }

    @Transactional(readOnly = true)
    public List<Attendance> listByEmployee(UUID tenantId, UUID employeeId) {
        return attendanceRepository.findByTenantIdAndEmployeeIdOrderByClockInAtDesc(tenantId, employeeId);
    }

    @Transactional(readOnly = true)
    public BigDecimal totalHoursWorked(UUID tenantId, UUID employeeId, Instant from, Instant to) {
        return attendanceRepository.sumHoursWorked(tenantId, employeeId, from, to);
    }

    @Transactional
    public Attendance clockIn(UUID tenantId, UUID recordedBy, ClockInRequest req) {
        // Prevent duplicate open clock-ins
        attendanceRepository.findByTenantIdAndEmployeeIdAndClockOutAtIsNull(
                tenantId, req.getEmployeeId()).ifPresent(a -> {
            throw new ConflictException("Employee already clocked in (id: " + a.getId() + ")");
        });

        Attendance attendance = Attendance.builder()
                .tenantId(tenantId)
                .employeeId(req.getEmployeeId())
                .shiftId(req.getShiftId())
                .clockInAt(Instant.now())
                .notes(req.getNotes())
                .recordedBy(recordedBy)
                .build();
        return attendanceRepository.save(attendance);
    }

    @Transactional
    public Attendance clockOut(UUID tenantId, UUID employeeId) {
        Attendance attendance = attendanceRepository
                .findByTenantIdAndEmployeeIdAndClockOutAtIsNull(tenantId, employeeId)
                .orElseThrow(() -> new ResourceNotFoundException(
                        "No open clock-in found for employee: " + employeeId));

        Instant clockOut = Instant.now();
        Duration duration = Duration.between(attendance.getClockInAt(), clockOut);
        BigDecimal hours = BigDecimal.valueOf(duration.toMinutes())
                .divide(BigDecimal.valueOf(60), 2, RoundingMode.HALF_UP);

        attendance.setClockOutAt(clockOut);
        attendance.setHoursWorked(hours);
        Attendance saved = attendanceRepository.save(attendance);

        // Check if employee is approaching overtime (36–39.9 hours this week)
        checkOvertimeApproaching(tenantId, employeeId, clockOut);

        return saved;
    }

    private void checkOvertimeApproaching(UUID tenantId, UUID employeeId, Instant clockOut) {
        try {
            ZonedDateTime zdt       = clockOut.atZone(ZoneId.of("Asia/Kolkata"));
            Instant weekStart       = zdt.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY))
                                        .toLocalDate().atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();
            Instant weekEnd         = zdt.toLocalDate().plusDays(1)
                                        .atStartOfDay(ZoneId.of("Asia/Kolkata")).toInstant();

            BigDecimal weeklyHours  = attendanceRepository.sumHoursWorked(tenantId, employeeId, weekStart, weekEnd);
            if (weeklyHours == null) return;

            if (weeklyHours.compareTo(OVERTIME_WARNING_HOURS) >= 0
                    && weeklyHours.compareTo(OVERTIME_THRESHOLD) < 0) {
                employeeRepository.findByIdAndTenantIdAndDeletedAtIsNull(employeeId, tenantId)
                    .ifPresent(emp -> {
                        String name = emp.getFirstName() + " " + emp.getLastName();
                        eventPublisher.publishOvertimeApproaching(
                            tenantId, employeeId, name, weeklyHours.doubleValue());
                        log.info("Overtime approaching alert fired for employee {} ({}h this week)",
                            name, weeklyHours);
                    });
            }
        } catch (Exception e) {
            log.warn("Could not check overtime for employee {}: {}", employeeId, e.getMessage());
        }
    }
}
