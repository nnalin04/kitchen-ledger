package com.kitchenledger.auth.config;

import lombok.extern.slf4j.Slf4j;
import org.flywaydb.core.Flyway;
import org.flywaydb.core.api.MigrationInfo;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

import javax.sql.DataSource;

/**
 * Explicit Flyway configuration.
 * Spring Boot 4 no longer includes FlywayAutoConfiguration in spring-boot-autoconfigure.
 */
@Slf4j
@Configuration
public class FlywayConfig {

    @Bean
    public Flyway flyway(
            DataSource dataSource,
            @Value("${spring.flyway.enabled:true}") boolean enabled) {

        Flyway flyway = Flyway.configure()
                .dataSource(dataSource)
                .locations("classpath:db/migration")
                .baselineOnMigrate(true)
                .baselineVersion("0")
                .validateOnMigrate(false)
                .outOfOrder(false)
                .load();

        if (enabled) {
            var result = flyway.migrate();
            log.info("Flyway migration complete: {} migrations applied", result.migrationsExecuted);
        }
        return flyway;
    }
}
