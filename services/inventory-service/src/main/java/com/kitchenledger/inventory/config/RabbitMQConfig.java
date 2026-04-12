package com.kitchenledger.inventory.config;

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

    @Value("${rabbitmq.queues.inventory-service:inventory-service}")
    private String inventoryQueue;

    @Bean
    public TopicExchange kitchenledgerExchange() {
        return new TopicExchange(exchangeName, true, false);
    }

    @Bean
    public Queue inventoryServiceQueue() {
        return QueueBuilder.durable(inventoryQueue).build();
    }

    @Bean
    public Binding inventoryOcrBinding(Queue inventoryServiceQueue, TopicExchange kitchenledgerExchange) {
        return BindingBuilder.bind(inventoryServiceQueue)
            .to(kitchenledgerExchange)
            .with("ai.ocr.completed");
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
