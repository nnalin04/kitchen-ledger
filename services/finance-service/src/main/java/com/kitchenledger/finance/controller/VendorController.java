package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.CreateVendorRequest;
import com.kitchenledger.finance.dto.response.VendorResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.VendorService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/finance/vendors")
@RequiredArgsConstructor
public class VendorController {

    private final VendorService vendorService;

    @GetMapping
    public ResponseEntity<List<VendorResponse>> list(HttpServletRequest req) {
        return ResponseEntity.ok(
                vendorService.listByTenant(tenantId(req))
                        .stream().map(VendorResponse::from).toList());
    }

    @GetMapping("/{id}")
    public ResponseEntity<VendorResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(VendorResponse.from(vendorService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<VendorResponse> create(HttpServletRequest req,
                                                  @Valid @RequestBody CreateVendorRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(VendorResponse.from(vendorService.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<VendorResponse> update(HttpServletRequest req,
                                                  @PathVariable UUID id,
                                                  @Valid @RequestBody CreateVendorRequest body) {
        return ResponseEntity.ok(VendorResponse.from(vendorService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        vendorService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
