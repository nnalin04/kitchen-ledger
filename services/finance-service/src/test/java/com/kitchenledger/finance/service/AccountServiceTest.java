package com.kitchenledger.finance.service;

import com.kitchenledger.finance.model.Account;
import com.kitchenledger.finance.model.enums.AccountType;
import com.kitchenledger.finance.repository.AccountRepository;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.ArgumentCaptor;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.List;
import java.util.UUID;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountServiceTest {

    @Mock
    private AccountRepository accountRepository;

    @InjectMocks
    private AccountService accountService;

    // ── seedDefaultAccounts ───────────────────────────────────────────────────

    @Test
    void seedDefaultAccounts_creates9StandardAccounts() {
        UUID tenantId = UUID.randomUUID();
        when(accountRepository.existsByTenantIdAndDeletedAtIsNull(tenantId)).thenReturn(false);
        when(accountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        accountService.seedDefaultAccounts(tenantId);

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository, times(9)).save(captor.capture());

        List<Account> saved = captor.getAllValues();
        assertThat(saved).hasSize(9);
        assertThat(saved).allMatch(a -> a.getTenantId().equals(tenantId));

        // Verify revenue accounts
        assertThat(saved).anyMatch(a -> "REV-FOOD".equals(a.getAccountCode())
                && AccountType.revenue == a.getAccountType());
        assertThat(saved).anyMatch(a -> "REV-BEV".equals(a.getAccountCode())
                && AccountType.revenue == a.getAccountType());

        // Verify labor accounts
        assertThat(saved).anyMatch(a -> "LAB-FOH".equals(a.getAccountCode())
                && AccountType.expense == a.getAccountType());
        assertThat(saved).anyMatch(a -> "LAB-BOH".equals(a.getAccountCode()));

        // Verify operating accounts
        assertThat(saved).anyMatch(a -> "OPR-RENT".equals(a.getAccountCode()));
        assertThat(saved).anyMatch(a -> "OPR-UTIL".equals(a.getAccountCode()));
        assertThat(saved).anyMatch(a -> "OPR-INS".equals(a.getAccountCode()));
    }

    @Test
    void seedDefaultAccounts_idempotent_skipsIfAccountsExist() {
        UUID tenantId = UUID.randomUUID();
        when(accountRepository.existsByTenantIdAndDeletedAtIsNull(tenantId)).thenReturn(true);

        accountService.seedDefaultAccounts(tenantId);

        verify(accountRepository, never()).save(any());
    }

    @Test
    void seedDefaultAccounts_allExpenseCodesPresent() {
        UUID tenantId = UUID.randomUUID();
        when(accountRepository.existsByTenantIdAndDeletedAtIsNull(tenantId)).thenReturn(false);
        when(accountRepository.save(any())).thenAnswer(inv -> inv.getArgument(0));

        accountService.seedDefaultAccounts(tenantId);

        ArgumentCaptor<Account> captor = ArgumentCaptor.forClass(Account.class);
        verify(accountRepository, times(9)).save(captor.capture());

        List<String> codes = captor.getAllValues().stream()
                .map(Account::getAccountCode).toList();

        assertThat(codes).containsExactlyInAnyOrder(
                "REV-FOOD", "REV-BEV",
                "COGS-FOOD", "COGS-BEV",
                "LAB-FOH", "LAB-BOH",
                "OPR-RENT", "OPR-UTIL", "OPR-INS"
        );
    }
}
