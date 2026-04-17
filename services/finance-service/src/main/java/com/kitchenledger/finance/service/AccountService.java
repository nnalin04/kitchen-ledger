package com.kitchenledger.finance.service;

import com.kitchenledger.finance.dto.request.CreateAccountRequest;
import com.kitchenledger.finance.exception.ConflictException;
import com.kitchenledger.finance.exception.ResourceNotFoundException;
import com.kitchenledger.finance.exception.ValidationException;
import com.kitchenledger.finance.model.Account;
import com.kitchenledger.finance.model.enums.AccountType;
import com.kitchenledger.finance.repository.AccountRepository;
import lombok.RequiredArgsConstructor;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.List;
import java.util.UUID;

@Service
@RequiredArgsConstructor
public class AccountService {

    private final AccountRepository accountRepository;

    @Transactional(readOnly = true)
    public List<Account> listByTenant(UUID tenantId, AccountType type) {
        if (type != null) {
            return accountRepository.findByTenantIdAndAccountTypeAndActiveTrueAndDeletedAtIsNull(tenantId, type);
        }
        return accountRepository.findByTenantIdAndActiveTrueAndDeletedAtIsNull(tenantId);
    }

    @Transactional(readOnly = true)
    public Account getById(UUID tenantId, UUID id) {
        return accountRepository.findByIdAndTenantIdAndDeletedAtIsNull(id, tenantId)
                .orElseThrow(() -> new ResourceNotFoundException("Account not found: " + id));
    }

    @Transactional
    public Account create(UUID tenantId, CreateAccountRequest req) {
        if (accountRepository.existsByTenantIdAndAccountCodeIgnoreCaseAndDeletedAtIsNull(tenantId, req.getAccountCode())) {
            throw new ConflictException("Account code already exists: " + req.getAccountCode());
        }
        Account account = Account.builder()
                .tenantId(tenantId)
                .accountCode(req.getAccountCode())
                .accountName(req.getAccountName())
                .accountType(req.getAccountType())
                .parentId(req.getParentId())
                .build();
        return accountRepository.save(account);
    }

    @Transactional
    public Account update(UUID tenantId, UUID id, CreateAccountRequest req) {
        Account account = getById(tenantId, id);
        if (account.isSystem()) {
            throw new ValidationException("System accounts cannot be modified.");
        }
        account.setAccountCode(req.getAccountCode());
        account.setAccountName(req.getAccountName());
        account.setAccountType(req.getAccountType());
        account.setParentId(req.getParentId());
        return accountRepository.save(account);
    }

    /**
     * Seeds a standard chart of accounts for a newly registered tenant.
     * Idempotent — no-op if accounts already exist for this tenant.
     */
    @Transactional
    public void seedDefaultAccounts(UUID tenantId) {
        if (accountRepository.existsByTenantIdAndDeletedAtIsNull(tenantId)) return;

        record DefaultAccount(String code, String name, AccountType type) {}

        List<DefaultAccount> defaults = List.of(
            new DefaultAccount("REV-FOOD",  "Food Sales",     AccountType.revenue),
            new DefaultAccount("REV-BEV",   "Beverage Sales", AccountType.revenue),
            new DefaultAccount("COGS-FOOD", "Food Cost",      AccountType.expense),
            new DefaultAccount("COGS-BEV",  "Beverage Cost",  AccountType.expense),
            new DefaultAccount("LAB-FOH",   "Wages - FOH",    AccountType.expense),
            new DefaultAccount("LAB-BOH",   "Wages - BOH",    AccountType.expense),
            new DefaultAccount("OPR-RENT",  "Rent",           AccountType.expense),
            new DefaultAccount("OPR-UTIL",  "Utilities",      AccountType.expense),
            new DefaultAccount("OPR-INS",   "Insurance",      AccountType.expense)
        );

        for (DefaultAccount d : defaults) {
            Account account = Account.builder()
                    .tenantId(tenantId)
                    .accountCode(d.code())
                    .accountName(d.name())
                    .accountType(d.type())
                    .build();
            accountRepository.save(account);
        }
    }

    @Transactional
    public void deactivate(UUID tenantId, UUID id) {
        Account account = getById(tenantId, id);
        if (account.isSystem()) {
            throw new ValidationException("System accounts cannot be deactivated.");
        }
        account.setActive(false);
        accountRepository.save(account);
    }
}
