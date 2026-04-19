package com.kitchenledger.inventory.controller;

import com.kitchenledger.inventory.dto.CreateTransferRequest;
import com.kitchenledger.inventory.dto.StockTransferResponse;
import com.kitchenledger.inventory.security.RequiresRole;
import com.kitchenledger.inventory.service.StockTransferService;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.data.domain.Page;
import org.springframework.data.domain.Pageable;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.*;

import java.util.UUID;

@RestController
@RequestMapping("/api/v1/inventory/transfers")
@RequiredArgsConstructor
public class StockTransferController {

    private final StockTransferService transferService;

    @PostMapping
    @ResponseStatus(HttpStatus.CREATED)
    public StockTransferResponse createTransfer(@Valid @RequestBody CreateTransferRequest request) {
        return transferService.createTransfer(request);
    }

    @GetMapping
    public Page<StockTransferResponse> getTransfers(Pageable pageable) {
        return transferService.getTransfers(pageable);
    }

    @GetMapping("/{id}")
    public StockTransferResponse getTransfer(@PathVariable UUID id) {
        return transferService.getTransfer(id);
    }

    @PostMapping("/{id}/approve")
    @ResponseStatus(HttpStatus.OK)
    @RequiresRole({"owner", "manager"})
    public StockTransferResponse approveTransfer(@PathVariable UUID id) {
        return transferService.approveTransfer(id);
    }

    @PostMapping("/{id}/complete")
    @ResponseStatus(HttpStatus.OK)
    @RequiresRole({"owner", "manager"})
    public StockTransferResponse completeTransfer(@PathVariable UUID id) {
        return transferService.completeTransfer(id);
    }

    @PostMapping("/{id}/cancel")
    @ResponseStatus(HttpStatus.OK)
    public StockTransferResponse cancelTransfer(@PathVariable UUID id) {
        return transferService.cancelTransfer(id);
    }
}
