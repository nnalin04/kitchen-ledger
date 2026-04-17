package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.request.CreateInventoryItemRequest;
import com.kitchenledger.inventory.dto.response.InventoryItemResponse;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.InventoryItemService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/items")
@RequiredArgsConstructor
public class InventoryItemController {

    private final InventoryItemService itemService;

    @GetMapping
    public ResponseEntity<Page<InventoryItemResponse>> list(
            HttpServletRequest req,
            @RequestParam(required = false) String search,
            @RequestParam(required = false) String abcCategory,
            @RequestParam(defaultValue = "false") boolean lowStockOnly,
            @PageableDefault(size = 50) Pageable pageable) {

        UUID tenantId = tenantId(req);
        return ResponseEntity.ok(
                itemService.list(tenantId, search, abcCategory, lowStockOnly, pageable)
                        .map(InventoryItemResponse::from));
    }

    @GetMapping("/below-par")
    public ResponseEntity<List<InventoryItemResponse>> belowPar(HttpServletRequest req) {
        UUID tenantId = tenantId(req);
        List<InventoryItemResponse> items = itemService.getBelowPar(tenantId)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/{id}")
    public ResponseEntity<InventoryItemResponse> getById(HttpServletRequest req,
                                                          @PathVariable UUID id) {
        return ResponseEntity.ok(
                InventoryItemResponse.from(itemService.getById(tenantId(req), id)));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<InventoryItemResponse> create(HttpServletRequest req,
                                                         @Valid @RequestBody CreateInventoryItemRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(InventoryItemResponse.from(itemService.create(tenantId(req), body)));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<InventoryItemResponse> update(HttpServletRequest req,
                                                         @PathVariable UUID id,
                                                         @Valid @RequestBody CreateInventoryItemRequest body) {
        return ResponseEntity.ok(
                InventoryItemResponse.from(itemService.update(tenantId(req), id, body)));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        itemService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    @PostMapping("/{id}/adjust-stock")
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public ResponseEntity<InventoryItemResponse> adjustStock(HttpServletRequest req,
                                                              @PathVariable UUID id,
                                                              @RequestBody Map<String, Object> body) {
        BigDecimal delta = new BigDecimal(body.get("delta").toString());
        String unit = body.get("unit").toString();
        String reason = body.containsKey("reason") ? body.get("reason").toString() : null;
        UUID userId = userId(req);
        return ResponseEntity.ok(
                InventoryItemResponse.from(
                        itemService.adjustStock(tenantId(req), id, delta, unit, reason, userId)));
    }

    @PostMapping("/{id}/opening-stock")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<InventoryItemResponse> setOpeningStock(HttpServletRequest req,
                                                                   @PathVariable UUID id,
                                                                   @RequestBody Map<String, Object> body) {
        BigDecimal quantity = new BigDecimal(body.get("quantity").toString());
        BigDecimal unitCost = new BigDecimal(body.get("unit_cost").toString());
        return ResponseEntity.ok(
                InventoryItemResponse.from(
                        itemService.setOpeningStock(tenantId(req), id, quantity, unitCost, userId(req))));
    }

    // ── helpers ──────────────────────────────────────────────────────

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
