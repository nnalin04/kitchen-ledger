package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.CreateVendorPaymentRequest;
import com.kitchenledger.finance.dto.response.VendorPaymentResponse;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.VendorPaymentService;
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
@RequestMapping("/api/v1/finance/vendor-payments")
@RequiredArgsConstructor
public class VendorPaymentController {

    private final VendorPaymentService paymentService;

    @GetMapping
    public ResponseEntity<Page<VendorPaymentResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) UUID vendorId,
            @PageableDefault(size = 50) Pageable pageable) {
        return ResponseEntity.ok(
                paymentService.list(tenantId(req), vendorId, pageable)
                        .map(VendorPaymentResponse::from));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<VendorPaymentResponse> create(HttpServletRequest req,
                                                         @Valid @RequestBody CreateVendorPaymentRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(VendorPaymentResponse.from(
                        paymentService.create(tenantId(req), userId(req), body)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
