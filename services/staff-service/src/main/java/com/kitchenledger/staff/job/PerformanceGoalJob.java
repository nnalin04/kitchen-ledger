package com.kitchenledger.staff.job;

import com.kitchenledger.staff.service.PerformanceGoalService;
import lombok.RequiredArgsConstructor;
import lombok.extern.slf4j.Slf4j;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

/**
 * Runs daily at midnight and marks any active performance goals whose period
 * has ended as MISSED.
 */
@Component
@RequiredArgsConstructor
@Slf4j
public class PerformanceGoalJob {

    private final PerformanceGoalService goalService;

    @Scheduled(cron = "0 0 0 * * *") // midnight daily
    public void markExpired() {
        int count = goalService.markExpiredGoals();
        log.info("PerformanceGoalJob: marked {} goals as MISSED", count);
    }
}
