package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateShiftRequest;
import com.kitchenledger.staff.dto.response.ShiftResponse;
import com.kitchenledger.staff.model.enums.ShiftStatus;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.ShiftService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/shifts")
@RequiredArgsConstructor
public class ShiftController {

    private final ShiftService shiftService;

    @GetMapping
    public ResponseEntity<List<ShiftResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @RequestParam(required = false) UUID employeeId) {

        UUID tenantId = tenantId(req);
        List<ShiftResponse> result;

        if (employeeId != null && from != null && to != null) {
            result = shiftService.listByEmployee(tenantId, employeeId, from, to)
                    .stream().map(ShiftResponse::from).toList();
        } else if (from != null && to != null) {
            result = shiftService.listByDateRange(tenantId, from, to)
                    .stream().map(ShiftResponse::from).toList();
        } else {
            LocalDate target = date != null ? date : LocalDate.now();
            result = shiftService.listByDate(tenantId, target)
                    .stream().map(ShiftResponse::from).toList();
        }
        return ResponseEntity.ok(result);
    }

    @GetMapping("/{id}")
    public ResponseEntity<ShiftResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftResponse.from(shiftService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ShiftResponse> create(HttpServletRequest req,
                                                 @Valid @RequestBody CreateShiftRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ShiftResponse.from(shiftService.create(tenantId(req), userId(req), body)));
    }

    @PatchMapping("/{id}/status")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ShiftResponse> updateStatus(HttpServletRequest req,
                                                       @PathVariable UUID id,
                                                       @RequestBody Map<String, String> body) {
        ShiftStatus status = ShiftStatus.valueOf(body.get("status"));
        return ResponseEntity.ok(ShiftResponse.from(shiftService.updateStatus(tenantId(req), id, status)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        shiftService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
