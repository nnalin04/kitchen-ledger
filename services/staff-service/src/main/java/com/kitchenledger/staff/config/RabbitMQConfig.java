package com.kitchenledger.staff.config;

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

    @Value("${rabbitmq.queues.staff-service:staff-service}")
    private String staffQueue;

    @Bean
    public TopicExchange kitchenledgerExchange() {
        return new TopicExchange(exchangeName, true, false);
    }

    @Bean
    public Queue staffServiceQueue() {
        return QueueBuilder.durable(staffQueue).build();
    }

    @Bean
    public Binding staffUserRegisteredBinding(Queue staffServiceQueue, TopicExchange kitchenledgerExchange) {
        return BindingBuilder.bind(staffServiceQueue)
            .to(kitchenledgerExchange)
            .with("auth.user.registered");
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
