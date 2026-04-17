package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.CreateStockReceiptRequest;
import com.kitchenledger.inventory.dto.response.StockReceiptResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.StockReceiptService;
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
@RequestMapping("/api/v1/inventory/stock-receipts")
@RequiredArgsConstructor
public class StockReceiptController {

    private final StockReceiptService receiptService;

    @GetMapping
    public ResponseEntity<Page<StockReceiptResponse>> list(
            HttpServletRequest req,
            @PageableDefault(size = 30) Pageable pageable) {
        return ResponseEntity.ok(
                receiptService.list(tenantId(req), pageable)
                        .map(StockReceiptResponse::from));
    }

    @GetMapping("/{id}")
    public ResponseEntity<StockReceiptResponse> getById(HttpServletRequest req,
                                                         @PathVariable UUID id) {
        return ResponseEntity.ok(
                StockReceiptResponse.from(receiptService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<StockReceiptResponse> create(HttpServletRequest req,
                                                        @Valid @RequestBody CreateStockReceiptRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(StockReceiptResponse.from(
                        receiptService.create(tenantId(req), userId(req), body)));
    }

    /** Confirms receipt: updates stock, writes ledger, fires events. */
    @PostMapping("/{id}/confirm")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<StockReceiptResponse> confirm(HttpServletRequest req,
                                                         @PathVariable UUID id) {
        return ResponseEntity.ok(
                StockReceiptResponse.from(receiptService.confirm(tenantId(req), id)));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
