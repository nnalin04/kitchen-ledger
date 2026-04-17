package com.kitchenledger.finance;

import org.springframework.boot.SpringApplication;
import org.springframework.boot.autoconfigure.SpringBootApplication;
import org.springframework.scheduling.annotation.EnableScheduling;

@SpringBootApplication
@EnableScheduling
public class FinanceServiceApplication {
    public static void main(String[] args) {
        SpringApplication.run(FinanceServiceApplication.class, args);
    }
}
