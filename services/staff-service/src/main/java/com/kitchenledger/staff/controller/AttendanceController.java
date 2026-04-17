package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.ClockInRequest;
import com.kitchenledger.staff.dto.response.AttendanceResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.AttendanceService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.time.Instant;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/attendance")
@RequiredArgsConstructor
public class AttendanceController {

    private final AttendanceService attendanceService;

    @GetMapping
    public ResponseEntity<Page<AttendanceResponse>> list(
            HttpServletRequest req,
            @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(
                attendanceService.list(tenantId(req), pageable)
                        .map(AttendanceResponse::from));
    }

    @GetMapping("/employee/{employeeId}")
    public ResponseEntity<List<AttendanceResponse>> listByEmployee(
            HttpServletRequest req, @PathVariable UUID employeeId) {
        return ResponseEntity.ok(
                attendanceService.listByEmployee(tenantId(req), employeeId)
                        .stream().map(AttendanceResponse::from).toList());
    }

    @GetMapping("/employee/{employeeId}/hours")
    public ResponseEntity<Map<String, BigDecimal>> totalHours(
            HttpServletRequest req,
            @PathVariable UUID employeeId,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE_TIME) Instant to) {
        BigDecimal hours = attendanceService.totalHoursWorked(tenantId(req), employeeId, from, to);
        return ResponseEntity.ok(Map.of("total_hours_worked", hours));
    }

    @PostMapping("/clock-in")
    @RequiresRole({"owner", "manager", "kitchen_staff", "server"})
    public ResponseEntity<AttendanceResponse> clockIn(HttpServletRequest req,
                                                       @Valid @RequestBody ClockInRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(AttendanceResponse.from(attendanceService.clockIn(tenantId(req), userId(req), body)));
    }

    @PostMapping("/clock-out/{employeeId}")
    @RequiresRole({"owner", "manager", "kitchen_staff", "server"})
    public ResponseEntity<AttendanceResponse> clockOut(HttpServletRequest req,
                                                        @PathVariable UUID employeeId) {
        return ResponseEntity.ok(AttendanceResponse.from(
                attendanceService.clockOut(tenantId(req), employeeId)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
