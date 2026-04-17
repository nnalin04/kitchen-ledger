package com.kitchenledger.finance.security;

import jakarta.persistence.EntityManager;
import jakarta.persistence.PersistenceContext;
import org.aspectj.lang.ProceedingJoinPoint;
import org.aspectj.lang.annotation.Around;
import org.aspectj.lang.annotation.Aspect;
import org.springframework.core.annotation.Order;
import org.springframework.stereotype.Component;

/**
 * Activates PostgreSQL Row-Level Security for every {@code @Transactional} method
 * by setting the {@code app.current_tenant_id} session variable on the same
 * database connection that the transaction uses.
 *
 * <p><strong>Ordering contract:</strong> This aspect runs at {@code @Order(1)}.
 * The transaction manager is registered at {@code order = 0} via
 * {@code @EnableTransactionManagement(order = 0)} on the application class.
 * Because order=0 has higher precedence (runs outermost), the transaction is
 * already open by the time this aspect's {@code @Around} body executes —
 * so {@code set_config(LOCAL)} is issued on the same JDBC connection.</p>
 *
 * <p>{@code set_config('app.current_tenant_id', ?, true)} uses {@code is_local = true},
 * meaning the setting is scoped to the current transaction and is automatically
 * cleared when the transaction commits or rolls back. This prevents tenant
 * context from leaking across pooled connections.</p>
 */
@Aspect
@Component
@Order(1)
public class TenantRlsAspect {

    @PersistenceContext
    private EntityManager em;

    @Around("@annotation(org.springframework.transaction.annotation.Transactional)")
    public Object applyTenantRls(ProceedingJoinPoint pjp) throws Throwable {
        String tenantId = TenantContext.get();
        if (tenantId != null) {
            em.createNativeQuery(
                "SELECT set_config('app.current_tenant_id', :tenantId, true)"
            )
            .setParameter("tenantId", tenantId)
            .getSingleResult();
        }
        String userId = TenantContext.getUserId();
        if (userId != null) {
            em.createNativeQuery(
                "SELECT set_config('app.current_user_id', :userId, true)"
            )
            .setParameter("userId", userId)
            .getSingleResult();
        }
        return pjp.proceed();
    }
}
