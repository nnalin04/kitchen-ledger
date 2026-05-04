package com.kitchenledger.finance.config;

import com.fasterxml.jackson.databind.ObjectMapper;
import com.fasterxml.jackson.databind.SerializationFeature;
import com.fasterxml.jackson.datatype.jsr310.JavaTimeModule;
import org.springframework.boot.autoconfigure.condition.ConditionalOnMissingBean;
import org.springframework.context.annotation.Primary;
import org.springframework.amqp.core.*;
import org.springframework.amqp.rabbit.connection.ConnectionFactory;
import org.springframework.amqp.rabbit.core.RabbitTemplate;
import org.springframework.amqp.support.converter.Jackson2JsonMessageConverter;
import org.springframework.amqp.support.converter.MessageConverter;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;

@Configuration
public class RabbitMQConfig {

    @Value("${rabbitmq.exchange:kitchenledger.events}")
    private String exchangeName;

    @Value("${rabbitmq.queues.finance-service:finance-service}")
    private String financeQueue;

    @Bean
    public TopicExchange kitchenledgerExchange() {
        return new TopicExchange(exchangeName, true, false);
    }

    @Bean
    public Queue financeServiceQueue() {
        return QueueBuilder.durable(financeQueue)
                .withArgument("x-dead-letter-exchange", "kitchenledger.dlx")
                .withArgument("x-dead-letter-routing-key", "finance-service.dead")
                .build();
    }

    @Bean
    public Binding financeTenantCreatedBinding(Queue financeServiceQueue, TopicExchange kitchenledgerExchange) {
        return BindingBuilder.bind(financeServiceQueue)
            .to(kitchenledgerExchange)
            .with("auth.tenant.created");
    }

    @Bean
    public Binding financeOcrCompletedBinding(Queue financeServiceQueue, TopicExchange kitchenledgerExchange) {
        return BindingBuilder.bind(financeServiceQueue)
            .to(kitchenledgerExchange)
            .with("ai.ocr.completed");
    }

    @Bean
    @Primary
    @ConditionalOnMissingBean
    public ObjectMapper objectMapper() {
        return new ObjectMapper()
                .registerModule(new JavaTimeModule())
                .disable(SerializationFeature.WRITE_DATES_AS_TIMESTAMPS);
    }

    @Bean
    public MessageConverter jsonMessageConverter() {
        return new Jackson2JsonMessageConverter();
    }

    @Bean
    public RabbitTemplate rabbitTemplate(ConnectionFactory connectionFactory) {
        RabbitTemplate template = new RabbitTemplate(connectionFactory);
        template.setMessageConverter(jsonMessageConverter());
        return template;
    }
}
