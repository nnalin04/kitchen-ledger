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

import java.util.UUID;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.PageRequest;
import org.springframework.data.domain.Sort;

@RestController
@RequestMapping("/api/v1/finance/vendors")
@RequiredArgsConstructor
public class VendorController {

    private final VendorService vendorService;

    @GetMapping
    public ResponseEntity<Page<VendorResponse>> list(
            HttpServletRequest req,
            @RequestParam(defaultValue = "0")    int page,
            @RequestParam(defaultValue = "20")   int size,
            @RequestParam(defaultValue = "name") String sortBy,
            @RequestParam(defaultValue = "asc")  String sortDir) {
        var pageable = PageRequest.of(page, Math.min(size, 100),
                Sort.by(Sort.Direction.fromString(sortDir), sortBy));
        return ResponseEntity.ok(
                vendorService.listByTenant(tenantId(req), pageable).map(VendorResponse::from));
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
