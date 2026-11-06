# Optional VPS path — PHP 8.3 + Apache + Composer for Bagisto.
# Usage: see backend/README.md §"Docker alternative (VPS)" and docker-compose.yml.
# NOTE: reference configuration, not executed in this sandbox. Test on staging first.
FROM php:8.3-apache

RUN apt-get update && apt-get install -y --no-install-recommends \
      git unzip libicu-dev libzip-dev libpng-dev libjpeg62-turbo-dev libfreetype6-dev \
      libonig-dev libxml2-dev default-mysql-client \
    && docker-php-ext-configure gd --with-freetype --with-jpeg \
    && docker-php-ext-install -j"$(nproc)" bcmath ctype curl dom fileinfo gd intl mbstring pdo_mysql xml zip tokenizer \
    && a2enmod rewrite \
    && apt-get clean && rm -rf /var/lib/apt/lists/*

COPY --from=composer:2 /usr/bin/composer /usr/local/bin/composer

# Apache: serve Bagisto's public/ directory only
ENV APACHE_DOCUMENT_ROOT=/var/www/bagisto/public
RUN sed -ri -e 's!/var/www/html!${APACHE_DOCUMENT_ROOT}!g' /etc/apache2/sites-available/*.conf /etc/apache2/apache2.conf /etc/apache2/conf-available/*.conf
RUN printf '<Directory /var/www/bagisto/public>\n  AllowOverride All\n  Require all granted\n</Directory>\n' > /etc/apache2/conf-available/bagisto.conf && a2enconf bagisto

WORKDIR /var/www/bagisto
EXPOSE 80
