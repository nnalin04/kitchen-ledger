package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.CreatePurchaseOrderRequest;
import com.kitchenledger.inventory.dto.response.PurchaseOrderResponse;
import com.kitchenledger.inventory.model.enums.PurchaseOrderStatus;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.PurchaseOrderService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/purchase-orders")
@RequiredArgsConstructor
public class PurchaseOrderController {

    private final PurchaseOrderService poService;

    @GetMapping
    public ResponseEntity<Page<PurchaseOrderResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) PurchaseOrderStatus status,
            @PageableDefault(size = 30) Pageable pageable) {
        return ResponseEntity.ok(
                poService.list(tenantId(req), status, pageable)
                        .map(PurchaseOrderResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<PurchaseOrderResponse> getById(HttpServletRequest req,
                                                          @PathVariable UUID id) {
        return ResponseEntity.ok(
                PurchaseOrderResponse.from(poService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PurchaseOrderResponse> create(HttpServletRequest req,
                                                         @Valid @RequestBody CreatePurchaseOrderRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(PurchaseOrderResponse.from(
                        poService.create(tenantId(req), userId(req), body)));
    }

    @PostMapping("/{id}/send")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PurchaseOrderResponse> send(HttpServletRequest req,
                                                       @PathVariable UUID id,
                                                       @RequestBody(required = false) Map<String, String> body) {
        String sentVia = body != null ? body.getOrDefault("sent_via", "email") : "email";
        return ResponseEntity.ok(
                PurchaseOrderResponse.from(poService.send(tenantId(req), id, sentVia)));
    }

    @PostMapping("/{id}/confirm")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PurchaseOrderResponse> confirm(HttpServletRequest req,
                                                          @PathVariable UUID id) {
        return ResponseEntity.ok(
                PurchaseOrderResponse.from(poService.confirm(tenantId(req), id, userId(req))));
    }

    @PostMapping("/{id}/cancel")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PurchaseOrderResponse> cancel(HttpServletRequest req,
                                                         @PathVariable UUID id) {
        return ResponseEntity.ok(
                PurchaseOrderResponse.from(poService.cancel(tenantId(req), id)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        poService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
