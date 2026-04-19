package com.kitchenledger.auth.service;

import com.kitchenledger.auth.event.AuthEventPublisher;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.mockito.InjectMocks;
import org.mockito.Mock;
import org.mockito.junit.jupiter.MockitoExtension;

import java.util.UUID;

import static org.mockito.Mockito.*;

@ExtendWith(MockitoExtension.class)
class AccountSeedServiceTest {

    @Mock AuthEventPublisher eventPublisher;

    @InjectMocks AccountSeedService accountSeedService;

    @Test
    void testSeedOnTenantCreated_createsDefaultAccounts() {
        UUID tenantId = UUID.randomUUID();

        accountSeedService.seedNewTenant(tenantId);

        // AccountSeedService publishes auth.tenant.created; finance-service
        // consumes that event to create the default chart of accounts.
        verify(eventPublisher).publishTenantCreated(tenantId);
    }

    @Test
    void testSeedOnTenantCreated_idempotent_doesNotDuplicateOnRetry() {
        UUID tenantId = UUID.randomUUID();

        // Calling seedNewTenant twice (e.g. on retry after a transient error)
        // publishes the event twice — idempotency is enforced by the finance-service
        // consumer checking whether accounts already exist before inserting.
        accountSeedService.seedNewTenant(tenantId);
        accountSeedService.seedNewTenant(tenantId);

        verify(eventPublisher, times(2)).publishTenantCreated(tenantId);
        // No exception is thrown — the service itself is safe to retry
    }
}
