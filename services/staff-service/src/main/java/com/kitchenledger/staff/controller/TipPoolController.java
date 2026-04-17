package com.kitchenledger.staff.controller;

import com.kitchenledger.staff.dto.request.CreateTipPoolRequest;
import com.kitchenledger.staff.dto.response.TipPoolResponse;
import com.kitchenledger.staff.security.GatewayTrustFilter;
import com.kitchenledger.staff.security.RequiresRole;
import com.kitchenledger.staff.service.TipPoolService;
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
@RequestMapping("/api/v1/staff/tip-pools")
@RequiredArgsConstructor
public class TipPoolController {

    private final TipPoolService tipPoolService;

    @GetMapping
    public ResponseEntity<Page<TipPoolResponse>> list(
            HttpServletRequest req,
            @PageableDefault(size = 31) Pageable pageable) {
        return ResponseEntity.ok(
                tipPoolService.list(tenantId(req), pageable)
                        .map(TipPoolResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<TipPoolResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TipPoolResponse.from(tipPoolService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TipPoolResponse> create(HttpServletRequest req,
                                                   @Valid @RequestBody CreateTipPoolRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(TipPoolResponse.from(tipPoolService.create(tenantId(req), userId(req), body)));
    }

    @PostMapping("/{id}/distribute")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<TipPoolResponse> distribute(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(TipPoolResponse.from(tipPoolService.distribute(tenantId(req), id)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
