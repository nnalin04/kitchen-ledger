package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.CreateDsrRequest;
import com.kitchenledger.finance.dto.request.ReconcileCashRequest;
import com.kitchenledger.finance.dto.response.DsrResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.DailySalesReportService;
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
import java.time.LocalDate;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/finance/daily-sales-reports")
@RequiredArgsConstructor
public class DailySalesReportController {

    private final DailySalesReportService dsrService;

    @GetMapping
    public ResponseEntity<Page<DsrResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to,
            @PageableDefault(size = 31) Pageable pageable) {
        return ResponseEntity.ok(
                dsrService.list(tenantId(req), from, to, pageable).map(DsrResponse::from));
    }

    @GetMapping("/date/{date}")
    public ResponseEntity<DsrResponse> getByDate(
            HttpServletRequest req,
            @PathVariable @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate date) {
        return ResponseEntity.ok(DsrResponse.from(dsrService.getByDate(tenantId(req), date)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<DsrResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(DsrResponse.from(dsrService.getById(tenantId(req), id)));
    }

    @GetMapping("/summary")
    public ResponseEntity<Map<String, BigDecimal>> summary(
            HttpServletRequest req,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        UUID tenantId = tenantId(req);
        return ResponseEntity.ok(Map.of(
                "gross_sales", dsrService.totalGrossSales(tenantId, from, to),
                "net_sales",   dsrService.totalNetSales(tenantId, from, to)
        ));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<DsrResponse> create(HttpServletRequest req,
                                               @Valid @RequestBody CreateDsrRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(DsrResponse.from(dsrService.create(tenantId(req), userId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<DsrResponse> update(HttpServletRequest req,
                                               @PathVariable UUID id,
                                               @Valid @RequestBody CreateDsrRequest body) {
        return ResponseEntity.ok(DsrResponse.from(dsrService.update(tenantId(req), id, body)));
    }

    @PostMapping("/{id}/finalize")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<DsrResponse> finalize(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(DsrResponse.from(dsrService.finalize(tenantId(req), id, userId(req))));
    }

    @PostMapping("/{id}/reconcile")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<DsrResponse> reconcile(HttpServletRequest req,
                                                  @PathVariable UUID id,
                                                  @Valid @RequestBody ReconcileCashRequest body) {
        return ResponseEntity.ok(DsrResponse.from(
                dsrService.reconcile(tenantId(req), id, body.getActualCash())));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
