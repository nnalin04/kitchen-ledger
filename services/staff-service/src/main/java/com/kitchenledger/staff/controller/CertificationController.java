package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateCertificationRequest;
import com.kitchenledger.staff.dto.response.CertificationResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.CertificationService;
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
@RequestMapping("/api/v1/staff/certifications")
@RequiredArgsConstructor
public class CertificationController {

    private final CertificationService service;

    @GetMapping
    public ResponseEntity<Page<CertificationResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) UUID employeeId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
                service.list(tenantId(req), employeeId, pageable).map(CertificationResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<CertificationResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(CertificationResponse.from(service.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<CertificationResponse> create(HttpServletRequest req,
                                                         @Valid @RequestBody CreateCertificationRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(CertificationResponse.from(service.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<CertificationResponse> update(HttpServletRequest req,
                                                         @PathVariable UUID id,
                                                         @Valid @RequestBody CreateCertificationRequest body) {
        return ResponseEntity.ok(CertificationResponse.from(service.update(tenantId(req), id, body)));
    }

    @PostMapping("/{id}/revoke")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> revoke(HttpServletRequest req, @PathVariable UUID id) {
        service.revoke(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        service.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
