package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.CountItemListRequest;
import com.kitchenledger.inventory.dto.CountVarianceResponse;
import com.kitchenledger.inventory.dto.CreateCountRequest;
import com.kitchenledger.inventory.dto.InventoryCountResponse;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.StockCountService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/counts")
@RequiredArgsConstructor
public class StockCountController {

    private final StockCountService countService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    @RequiresRole({"owner", "manager"})
    public InventoryCountResponse startCount(@Valid @RequestBody CreateCountRequest request) {
        return countService.startCount(request);
    }

    @GetMapping
    public Page<InventoryCountResponse> getCounts(Pageable pageable) {
        return countService.getCounts(pageable);
    }

    @GetMapping("/{id}")
    public InventoryCountResponse getCount(@PathVariable UUID id) {
        return countService.getCount(id);
    }

    @PostMapping("/{id}/items")
    @ResponseStatus(HttpStatus.OK)
    @RequiresRole({"owner", "manager", "kitchen_staff"})
    public void submitItems(@PathVariable UUID id, @Valid @RequestBody CountItemListRequest request) {
        countService.submitItems(id, request);
    }

    @PostMapping("/{id}/complete")
    @ResponseStatus(HttpStatus.OK)
    @RequiresRole({"owner", "manager"})
    public InventoryCountResponse completeCount(@PathVariable UUID id) {
        return countService.completeCount(id);
    }

    @GetMapping("/{id}/variance")
    public CountVarianceResponse getCountVariance(@PathVariable UUID id) {
        return countService.getCountVariance(id);
    }
}
