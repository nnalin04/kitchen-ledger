package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateTimeOffRequest;
import com.kitchenledger.staff.dto.request.ReviewTimeOffRequest;
import com.kitchenledger.staff.dto.response.TimeOffRequestResponse;
import com.kitchenledger.staff.model.enums.TimeOffStatus;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.TimeOffService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/staff/time-off")
@RequiredArgsConstructor
public class TimeOffController {

    private final TimeOffService service;

    @GetMapping
    public ResponseEntity<Page<TimeOffRequestResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) UUID employeeId,
            @RequestParam(required = false) TimeOffStatus status,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
                service.list(tenantId(req), employeeId, status, pageable)
                       .map(TimeOffRequestResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TimeOffRequestResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TimeOffRequestResponse.from(service.getById(tenantId(req), id)));
    }

    @PostMapping
    public ResponseEntity<TimeOffRequestResponse> create(HttpServletRequest req,
                                                          @Valid @RequestBody CreateTimeOffRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(TimeOffRequestResponse.from(service.create(tenantId(req), body)));
    }

    @PostMapping("/{id}/approve")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TimeOffRequestResponse> approve(
            HttpServletRequest req,
            @PathVariable UUID id,
            @RequestBody(required = false) ReviewTimeOffRequest review) {
        return ResponseEntity.ok(TimeOffRequestResponse.from(
                service.approve(tenantId(req), id, userId(req), review)));
    }

    @PostMapping("/{id}/deny")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TimeOffRequestResponse> deny(
            HttpServletRequest req,
            @PathVariable UUID id,
            @RequestBody(required = false) ReviewTimeOffRequest review) {
        return ResponseEntity.ok(TimeOffRequestResponse.from(
                service.deny(tenantId(req), id, userId(req), review)));
    }

    @DeleteMapping("/{id}")
    public ResponseEntity<Void> cancel(HttpServletRequest req, @PathVariable UUID id) {
        service.cancel(tenantId(req), id, userId(req));
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
