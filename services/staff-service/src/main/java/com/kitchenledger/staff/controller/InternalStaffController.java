package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.response.AttendanceResponse;
import com.kitchenledger.staff.exception.AccessDeniedException;
import com.kitchenledger.staff.model.Attendance;
import com.kitchenledger.staff.model.Employee;
import com.kitchenledger.staff.repository.AttendanceRepository;
import com.kitchenledger.staff.repository.EmployeeRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Internal endpoints consumed by the report-service.
 * Protected by INTERNAL_SERVICE_SECRET header — not exposed publicly via Gateway.
 */
@RestController
@RequestMapping("/internal/staff")
@RequiredArgsConstructor
public class InternalStaffController {

    private final AttendanceRepository attendanceRepository;
    private final EmployeeRepository employeeRepository;

    @Value("${internal.service-secret}")
    private String internalSecret;

    /**
     * Returns attendance records for a tenant within a date range.
     * Each record includes the employee full name for reporting convenience.
     */
    @GetMapping("/attendance")
    public ResponseEntity<List<AttendanceWithNameResponse>> listAttendance(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        verifySecret(secret);

        Instant fromInstant = from != null
                ? from.atStartOfDay(ZoneOffset.UTC).toInstant()
                : Instant.ofEpochSecond(0);
        Instant toInstant = to != null
                ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant()
                : Instant.now();

        List<Attendance> records = attendanceRepository
                .findByTenantIdAndClockInAtBetweenOrderByClockInAtDesc(tenantId, fromInstant, toInstant);

        // Resolve employee names in one query
        List<UUID> empIds = records.stream().map(Attendance::getEmployeeId).distinct().toList();
        Map<UUID, String> nameById = employeeRepository.findAllById(empIds)
                .stream()
                .collect(Collectors.toMap(Employee::getId, Employee::getFullName));

        List<AttendanceWithNameResponse> response = records.stream()
                .map(a -> new AttendanceWithNameResponse(
                        AttendanceResponse.from(a),
                        nameById.getOrDefault(a.getEmployeeId(), "")
                ))
                .toList();

        return ResponseEntity.ok(response);
    }

    private void verifySecret(String provided) {
        if (provided == null || !MessageDigest.isEqual(
                internalSecret.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }

    /** Flat response combining AttendanceResponse fields with employee name. */
    public record AttendanceWithNameResponse(
            AttendanceResponse attendance,
            String employeeName
    ) {}
}
