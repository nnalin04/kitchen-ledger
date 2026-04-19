package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateShiftSwapRequest;
import com.kitchenledger.staff.dto.response.ShiftSwapResponse;
import com.kitchenledger.staff.model.enums.ShiftSwapStatus;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.ShiftSwapService;
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
@RequestMapping("/api/v1/staff/shift-swaps")
@RequiredArgsConstructor
public class ShiftSwapController {

    private final ShiftSwapService service;

    @GetMapping
    public ResponseEntity<Page<ShiftSwapResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) ShiftSwapStatus status,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
                service.list(tenantId(req), status, pageable).map(ShiftSwapResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<ShiftSwapResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftSwapResponse.from(service.getById(tenantId(req), id)));
    }

    @PostMapping
    public ResponseEntity<ShiftSwapResponse> request(HttpServletRequest req,
                                                       @Valid @RequestBody CreateShiftSwapRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(ShiftSwapResponse.from(service.request(tenantId(req), userId(req), body)));
    }

    @PostMapping("/{id}/accept")
    public ResponseEntity<ShiftSwapResponse> accept(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftSwapResponse.from(service.acceptByEmployee(tenantId(req), id)));
    }

    @PostMapping("/{id}/approve")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ShiftSwapResponse> approve(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftSwapResponse.from(service.approve(tenantId(req), id, userId(req))));
    }

    @PostMapping("/{id}/deny")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<ShiftSwapResponse> deny(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftSwapResponse.from(service.deny(tenantId(req), id, userId(req))));
    }

    @PostMapping("/{id}/cancel")
    public ResponseEntity<ShiftSwapResponse> cancel(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(ShiftSwapResponse.from(service.cancel(tenantId(req), id)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
