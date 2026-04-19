package com.kitchenledger.finance;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.boot.ApplicationRunner;
import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.retry.annotation.EnableRetry;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

// order = 0 ensures the transaction proxy wraps the call BEFORE TenantRlsAspect (@Order(1))
// fires, so set_config(LOCAL) is issued on the already-open transaction's JDBC connection.
@SpringBootApplication
@EnableRetry
@EnableScheduling
@EnableAspectJAutoProxy
@EnableTransactionManagement(order = 0)
public class FinanceServiceApplication {

    private static final Logger log = LoggerFactory.getLogger(FinanceServiceApplication.class);

    public static void main(String[] args) {
        SpringApplication.run(FinanceServiceApplication.class, args);
    }

    @Bean
    public ApplicationRunner validateSecrets(
            @Value("${internal.service-secret:}") String internalSecret) {
        return args -> {
            if (internalSecret == null || internalSecret.isBlank()
                    || "change-me-in-production".equals(internalSecret)
                    || internalSecret.length() < 32) {
                throw new IllegalStateException(
                        "FATAL: INTERNAL_SERVICE_SECRET is not configured or is using " +
                        "the default placeholder value. Set a secure random value " +
                        "(min 32 chars) before starting the service.");
            }
            log.info("Internal service secret validation passed.");
        };
    }
}
