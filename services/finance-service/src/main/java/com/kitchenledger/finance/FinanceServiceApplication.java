package com.kitchenledger.finance;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.context.annotation.EnableAspectJAutoProxy;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.transaction.annotation.EnableTransactionManagement;

// order = 0 ensures the transaction proxy wraps the call BEFORE TenantRlsAspect (@Order(1))
// fires, so set_config(LOCAL) is issued on the already-open transaction's JDBC connection.
@SpringBootApplication
@EnableScheduling
@EnableAspectJAutoProxy
@EnableTransactionManagement(order = 0)
public class FinanceServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(FinanceServiceApplication.class, args);
    }
}
