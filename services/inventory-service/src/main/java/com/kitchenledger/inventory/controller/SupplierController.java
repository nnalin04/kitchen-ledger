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

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@RestController
@RequestMapping("/api/v1/inventory/suppliers")
@RequiredArgsConstructor
public class SupplierController {

    private final SupplierService supplierService;

    @GetMapping
    public ResponseEntity<Page<SupplierResponse>> list(
            HttpServletRequest req,
            @RequestParam(defaultValue = "0")    int page,
            @RequestParam(defaultValue = "20")   int size,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc")  String sortDir) {
        var pageable = PageRequest.of(page, Math.min(size, 100),
                Sort.by(Sort.Direction.fromString(sortDir), sortBy));
        return ResponseEntity.ok(
                supplierService.listByTenant(tenantId(req), pageable).map(SupplierResponse::from));
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
