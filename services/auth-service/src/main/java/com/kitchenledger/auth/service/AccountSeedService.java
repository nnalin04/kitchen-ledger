package com.kitchenledger.auth.service;

import com.kitchenledger.auth.event.AuthEventPublisher;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.stereotype.Service;

import java.util.UUID;

/**
 * Triggers Finance Service to seed default chart of accounts and vendor categories
 * for a newly registered tenant. Publishing is fire-and-forget; Finance Service
 * consumes auth.tenant.created from its own RabbitMQ queue.
 */
@Service
@RequiredArgsConstructor
@Slf4j
public class AccountSeedService {

    private final AuthEventPublisher eventPublisher;

    public void seedNewTenant(UUID tenantId) {
        eventPublisher.publishTenantCreated(tenantId);
        log.info("Published auth.tenant.created for tenant {}", tenantId);
    }
}
