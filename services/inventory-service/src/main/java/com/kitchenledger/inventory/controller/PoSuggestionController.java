package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.model.PoSuggestion;
import com.kitchenledger.inventory.model.enums.PoSuggestionStatus;
import com.kitchenledger.inventory.security.GatewayTrustFilter;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.ParSuggestionService;
import jakarta.servlet.http.HttpServletRequest;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.data.web.PageableDefault;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.Map;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/po-suggestions")
@RequiredArgsConstructor
public class PoSuggestionController {

    private final ParSuggestionService parSuggestionService;

    @GetMapping
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Page<PoSuggestion>> list(
            HttpServletRequest req,
            @RequestParam(required = false) PoSuggestionStatus status,
            @PageableDefault(size = 20, sort = "createdAt") Pageable pageable) {
        return ResponseEntity.ok(
                parSuggestionService.list(tenantId(req), status, pageable));
    }

    @GetMapping("/{id}")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PoSuggestion> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(parSuggestionService.getById(tenantId(req), id));
    }

    /** Trigger on-demand PAR scan and generate suggestions for below-par items. */
    @PostMapping("/generate")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<Map<String, Integer>> generate(HttpServletRequest req) {
        int count = parSuggestionService.generateSuggestions(tenantId(req));
        return ResponseEntity.ok(Map.of("created", count));
    }

    @PostMapping("/{id}/approve")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PoSuggestion> approve(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(
                parSuggestionService.approve(tenantId(req), id, userId(req)));
    }

    @PostMapping("/{id}/reject")
    @RequiresRole({"owner", "manager"})
    public ResponseEntity<PoSuggestion> reject(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(
                parSuggestionService.reject(tenantId(req), id));
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }

    private UUID userId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_USER_ID);
    }
}
