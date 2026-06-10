FROM nginx:alpine

# Build-time cache-busting version (defaults to 'dev'; CI passes github.sha)
ARG BUILD_VERSION=dev

# Copy static files
COPY ./frontend/source /usr/share/nginx/html

# Stamp all asset query-string versions with the build version
RUN sed -i "s/v=[0-9]*/v=${BUILD_VERSION}/g" /usr/share/nginx/html/index.html

# Copy nginx configuration
COPY ./frontend/nginx.conf /etc/nginx/nginx.conf

# Copy security-headers configuration
COPY ./frontend/security-headers.conf /etc/nginx/conf.d/security-headers.conf

COPY ./frontend/entrypoint.sh /

# Expose port 8081
EXPOSE 8081

RUN chgrp -R 0 /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html /etc/nginx && \
    chmod -R g+rwX /var/cache/nginx /var/run /var/log/nginx /usr/share/nginx/html /etc/nginx

RUN chmod +x /entrypoint.sh

ENTRYPOINT ["/entrypoint.sh"]
# Start nginx
CMD ["nginx", "-g", "daemon off;"]
