package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.model.InventoryCategory;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.InventoryCategoryService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.Data;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/categories")
@RequiredArgsConstructor
public class InventoryCategoryController {

    private final InventoryCategoryService categoryService;

    @GetMapping
    public ResponseEntity<List<InventoryCategory>> list(HttpServletRequest req) {
        return ResponseEntity.ok(categoryService.listByTenant(tenantId(req)));
    }

    @GetMapping("/{id}")
    public ResponseEntity<InventoryCategory> getById(HttpServletRequest req,
                                                      @PathVariable UUID id) {
        return ResponseEntity.ok(categoryService.getById(tenantId(req), id));
    }

    @PostMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<InventoryCategory> create(HttpServletRequest req,
                                                     @Valid @RequestBody CategoryRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(categoryService.create(tenantId(req), body.getName(),
                        body.getParentId(), body.getSortOrder()));
    }

    @PatchMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<InventoryCategory> update(HttpServletRequest req,
                                                     @PathVariable UUID id,
                                                     @RequestBody CategoryRequest body) {
        return ResponseEntity.ok(categoryService.update(tenantId(req), id,
                body.getName(), body.getParentId(), body.getSortOrder()));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Void> delete(HttpServletRequest req, @PathVariable UUID id) {
        categoryService.delete(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    @Data
    static class CategoryRequest {
        @NotBlank
        private String name;
        private UUID parentId;
        private int sortOrder = 0;
    }
}
