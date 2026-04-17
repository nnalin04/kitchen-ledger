package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.CreateSupplierRequest;
import com.kitchenledger.inventory.dto.response.SupplierResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.SupplierService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/suppliers")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    public ResponseEntity<List<SupplierResponse>> list(HttpServletRequest req) {
        List<SupplierResponse> suppliers = supplierService.listByTenant(tenantId(req))
                .stream().map(SupplierResponse::from).toList();
        return ResponseEntity.ok(suppliers);
    }

    @GetMapping("/{id}")
    public ResponseEntity<SupplierResponse> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(
                SupplierResponse.from(supplierService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<SupplierResponse> create(HttpServletRequest req,
                                                    @Valid @RequestBody CreateSupplierRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(SupplierResponse.from(supplierService.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<SupplierResponse> update(HttpServletRequest req,
                                                    @PathVariable UUID id,
                                                    @Valid @RequestBody CreateSupplierRequest body) {
        return ResponseEntity.ok(
                SupplierResponse.from(supplierService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        supplierService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
