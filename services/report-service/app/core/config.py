from pydantic_settings import BaseSettings


class Settings(BaseSettings):
    # Server
    port: int = 8087

    # Database
    database_url: str

    # Redis
    redis_url: str = "redis://localhost:6379"

    # RabbitMQ
    rabbitmq_url: str = "amqp://kl_rabbit:kl_rabbit_pass@localhost:5672"

    # Internal service calls
    finance_service_url: str = "http://localhost:8083"
    inventory_service_url: str = "http://localhost:8082"
    internal_service_secret: str = ""

    # Supabase Storage
    supabase_storage_url: str = ""
    supabase_service_key: str = ""

    class Config:
        env_file = ".env"
        case_sensitive = False


settings = Settings()
