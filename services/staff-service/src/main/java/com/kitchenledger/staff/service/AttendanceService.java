package com.kitchenledger.staff.service;

import com.kitchenledger.staff.dto.request.ClockInRequest;
import com.kitchenledger.staff.exception.ConflictException;
import com.kitchenledger.staff.exception.ResourceNotFoundException;
import com.kitchenledger.staff.exception.ValidationException;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.repository.AttendanceRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Duration;
import java.time.Instant;
import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AttendanceService {

    private final AttendanceRepository attendanceRepository;

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
        return attendanceRepository.save(attendance);
    }
}
