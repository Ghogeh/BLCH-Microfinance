FROM php:8.2-cli-alpine

# Install system dependencies
RUN apk add --no-cache \
    git curl libpng-dev libxml2-dev zip unzip \
    mysql-client oniguruma-dev

# Install PHP extensions
RUN docker-php-ext-install \
    pdo pdo_mysql mbstring exif pcntl bcmath gd

# Install Redis extension
RUN pecl install redis && docker-php-ext-enable redis

# Install Composer
COPY --from=composer:latest /usr/bin/composer /usr/bin/composer

WORKDIR /var/www/backend

# Copy composer files first (better layer caching)
COPY composer.json composer.lock ./
RUN composer install --no-dev --optimize-autoloader --no-interaction

# Copy application code
COPY . .

# Set permissions for Laravel storage and cache
RUN chmod -R 775 storage bootstrap/cache

EXPOSE 8000

# Migrate, cache config/routes, then start Laravel dev server
CMD php artisan migrate --force && \
    php artisan config:cache && \
    php artisan route:cache && \
    php artisan serve --host=0.0.0.0 --port=8000
