package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.response.InventoryItemResponse;
import com.kitchenledger.inventory.dto.response.WasteLogResponse;
import com.kitchenledger.inventory.exception.AccessDeniedException;
import com.kitchenledger.inventory.model.InventoryItem;
import com.kitchenledger.inventory.model.WasteLog;
import com.kitchenledger.inventory.repository.InventoryItemRepository;
import com.kitchenledger.inventory.repository.WasteLogRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.format.annotation.DateTimeFormat;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.stream.Collectors;

/**
 * Internal endpoints consumed by other services (report-service, ai-service).
 * Protected by INTERNAL_SERVICE_SECRET header — not exposed publicly via Gateway.
 */
@RestController
@RequestMapping("/internal/inventory")
@RequiredArgsConstructor
public class InternalInventoryController {

    private final InventoryItemRepository itemRepository;
    private final WasteLogRepository wasteLogRepository;

    @Value("${internal.service-secret}")
    private String internalSecret;

    @GetMapping("/items")
    public ResponseEntity<List<InventoryItemResponse>> listItems(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<InventoryItemResponse> items = itemRepository
                .findByTenantIdAndDeletedAtIsNull(tenantId)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/items/{id}")
    public ResponseEntity<InventoryItemResponse> getItem(
            @RequestHeader("x-internal-secret") String secret,
            @PathVariable UUID id,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        return itemRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .map(InventoryItemResponse::from)
                .map(ResponseEntity::ok)
                .orElse(ResponseEntity.notFound().build());
    }

    @GetMapping("/items/below-par")
    public ResponseEntity<List<InventoryItemResponse>> belowPar(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId) {
        verifySecret(secret);
        List<InventoryItemResponse> items = itemRepository
                .findBelowParLevel(tenantId)
                .stream().map(InventoryItemResponse::from).toList();
        return ResponseEntity.ok(items);
    }

    @GetMapping("/waste")
    public ResponseEntity<List<WasteLogResponse>> listWaste(
            @RequestHeader("x-internal-secret") String secret,
            @RequestParam UUID tenantId,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate from,
            @RequestParam(required = false) @DateTimeFormat(iso = DateTimeFormat.ISO.DATE) LocalDate to) {
        verifySecret(secret);

        Instant fromInstant = from != null ? from.atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.EPOCH;
        Instant toInstant   = to   != null ? to.plusDays(1).atStartOfDay(ZoneOffset.UTC).toInstant() : Instant.now();

        List<WasteLog> logs = wasteLogRepository
                .findByTenantIdAndLoggedAtBetweenOrderByLoggedAtDesc(tenantId, fromInstant, toInstant);

        // Resolve item names in one query to avoid N+1
        List<UUID> itemIds = logs.stream().map(WasteLog::getInventoryItemId).distinct().toList();
        Map<UUID, String> nameById = itemRepository.findAllById(itemIds)
                .stream()
                .collect(Collectors.toMap(InventoryItem::getId, InventoryItem::getName));

        List<WasteLogResponse> response = logs.stream()
                .map(w -> {
                    WasteLogResponse r = WasteLogResponse.from(w);
                    r.setItemName(nameById.getOrDefault(w.getInventoryItemId(), null));
                    return r;
                })
                .toList();

        // Return as a list; callers can use inventoryItemId to correlate with item names
        return ResponseEntity.ok(response);
    }

    private void verifySecret(String provided) {
        if (provided == null || !MessageDigest.isEqual(
                internalSecret.getBytes(StandardCharsets.UTF_8),
                provided.getBytes(StandardCharsets.UTF_8))) {
            throw new AccessDeniedException("Invalid internal service secret");
        }
    }
}
