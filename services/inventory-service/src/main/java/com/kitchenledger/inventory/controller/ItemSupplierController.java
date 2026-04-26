package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.response.ItemSupplierResponse;
import com.kitchenledger.inventory.model.InventoryItemSupplier;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.ItemSupplierService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/items/{id}/suppliers")
@RequiredArgsConstructor
public class ItemSupplierController {

    private final ItemSupplierService itemSupplierService;

    @GetMapping
    public ResponseEntity<List<ItemSupplierResponse>> listSuppliers(
            HttpServletRequest req,
            @PathVariable UUID id) {
        UUID tenantId = tenantId(req);
        List<ItemSupplierResponse> suppliers = itemSupplierService.getItemSuppliers(tenantId, id)
                .stream().map(ItemSupplierResponse::from).toList();
        return ResponseEntity.ok(suppliers);
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> linkSupplier(
            HttpServletRequest req,
            @PathVariable UUID id,
            @RequestBody Map<String, Object> body) {
        UUID tenantId = tenantId(req);
        UUID supplierId = UUID.fromString(body.get("supplier_id").toString());
        BigDecimal unitPrice = new BigDecimal(body.get("unit_price").toString());
        boolean isPreferred = body.containsKey("is_preferred")
                && Boolean.parseBoolean(body.get("is_preferred").toString());

        InventoryItemSupplier saved = itemSupplierService.linkSupplier(tenantId, id, supplierId, unitPrice, isPreferred);
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(Map.of("success", true, "data", ItemSupplierResponse.from(saved)));
    }

    @PatchMapping("/{supplierId}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Object>> updatePrice(
            HttpServletRequest req,
            @PathVariable UUID id,
            @PathVariable UUID supplierId,
            @RequestBody Map<String, Object> body) {
        UUID tenantId = tenantId(req);
        BigDecimal newPrice = new BigDecimal(body.get("unit_price").toString());
        InventoryItemSupplier updated = itemSupplierService.updateSupplierPrice(tenantId, id, supplierId, newPrice);
        return ResponseEntity.ok(Map.of("success", true, "data", ItemSupplierResponse.from(updated)));
    }

    @DeleteMapping("/{supplierId}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> unlinkSupplier(
            HttpServletRequest req,
            @PathVariable UUID id,
            @PathVariable UUID supplierId) {
        UUID tenantId = tenantId(req);
        itemSupplierService.unlinkSupplier(tenantId, id, supplierId);
        return ResponseEntity.noContent().build();
    }

    // ── helpers ───────────────────────────────────────────────────────────────

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
