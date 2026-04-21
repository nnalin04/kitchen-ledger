package com.kitchenledger.finance.config;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.web.client.RestTemplate;

@Configuration
public class AppConfig {

    /**
     * Shared {@link RestTemplate} for internal service-to-service calls
     * (e.g. auth-service currency lookup in {@link com.kitchenledger.finance.client.TenantCurrencyResolver}).
     */
    @Bean
    public RestTemplate restTemplate() {
        return new RestTemplate();
    }
}
