package com.kitchenledger.finance.controller;

import com.kitchenledger.finance.dto.request.CreateAccountRequest;
import com.kitchenledger.finance.model.Account;
import com.kitchenledger.finance.model.enums.AccountType;
import com.kitchenledger.finance.security.GatewayTrustFilter;
import com.kitchenledger.finance.security.RequiresRole;
import com.kitchenledger.finance.service.AccountService;
import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import lombok.RequiredArgsConstructor;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.util.List;
import java.util.UUID;

@RestController
@RequestMapping("/api/v1/finance/accounts")
@RequiredArgsConstructor
public class AccountController {

    private final AccountService accountService;

    @GetMapping
    public ResponseEntity<List<Account>> list(HttpServletRequest req,
                                               @RequestParam(required = false) AccountType type) {
        return ResponseEntity.ok(accountService.listByTenant(tenantId(req), type));
    }

    @GetMapping("/{id}")
    public ResponseEntity<Account> getById(HttpServletRequest req, @PathVariable UUID id) {
        return ResponseEntity.ok(accountService.getById(tenantId(req), id));
    }

    @PostMapping
    @RequiresRole({"owner"})
    public ResponseEntity<Account> create(HttpServletRequest req,
                                           @Valid @RequestBody CreateAccountRequest body) {
        return ResponseEntity.status(HttpStatus.CREATED)
                .body(accountService.create(tenantId(req), body));
    }

    @PutMapping("/{id}")
    @RequiresRole({"owner"})
    public ResponseEntity<Account> update(HttpServletRequest req,
                                           @PathVariable UUID id,
                                           @Valid @RequestBody CreateAccountRequest body) {
        return ResponseEntity.ok(accountService.update(tenantId(req), id, body));
    }

    @DeleteMapping("/{id}")
    @RequiresRole({"owner"})
    public ResponseEntity<Void> deactivate(HttpServletRequest req, @PathVariable UUID id) {
        accountService.deactivate(tenantId(req), id);
        return ResponseEntity.noContent().build();
    }

    private UUID tenantId(HttpServletRequest req) {
        return (UUID) req.getAttribute(GatewayTrustFilter.ATTR_TENANT_ID);
    }
}
