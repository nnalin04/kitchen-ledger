package com.kitchenledger.finance.repository;

import com.kitchenledger.finance.model.Account;
import com.kitchenledger.finance.model.enums.AccountType;
import org.springframework.data.jpa.repository.JpaRepository;

import java.util.List;
import java.util.Optional;
import java.util.UUID;

public interface AccountRepository extends JpaRepository<Account, UUID> {

    List<Account> findByTenantIdAndActiveTrueAndDeletedAtIsNull(UUID tenantId);

    List<Account> findByTenantIdAndAccountTypeAndActiveTrueAndDeletedAtIsNull(UUID tenantId, AccountType type);

    Optional<Account> findByIdAndTenantIdAndDeletedAtIsNull(UUID id, UUID tenantId);

    boolean existsByTenantIdAndAccountCodeIgnoreCaseAndDeletedAtIsNull(UUID tenantId, String accountCode);

    boolean existsByTenantIdAndDeletedAtIsNull(UUID tenantId);
}
