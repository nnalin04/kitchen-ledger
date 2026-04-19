package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateTrainingMilestoneRequest;
import com.kitchenledger.staff.dto.response.TrainingMilestoneResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.TrainingMilestoneService;
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
@RequestMapping("/api/v1/staff/training")
@RequiredArgsConstructor
public class TrainingMilestoneController {

    private final TrainingMilestoneService service;

    @GetMapping
    public ResponseEntity<Page<TrainingMilestoneResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) UUID employeeId,
            @PageableDefault(size = 20) Pageable pageable) {
        return ResponseEntity.ok(
                service.list(tenantId(req), employeeId, pageable).map(TrainingMilestoneResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TrainingMilestoneResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TrainingMilestoneResponse.from(service.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TrainingMilestoneResponse> create(HttpServletRequest req,
                                                             @Valid @RequestBody CreateTrainingMilestoneRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(TrainingMilestoneResponse.from(service.create(tenantId(req), body)));
    }

    @PostMapping("/{id}/start")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TrainingMilestoneResponse> markInProgress(HttpServletRequest req,
                                                                      @PathVariable UUID id) {
        return ResponseEntity.ok(TrainingMilestoneResponse.from(service.markInProgress(tenantId(req), id)));
    }

    @PostMapping("/{id}/complete")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TrainingMilestoneResponse> complete(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TrainingMilestoneResponse.from(service.complete(tenantId(req), id)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
