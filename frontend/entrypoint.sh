#!/bin/sh

ENVIRONMENT=${ENVIRONMENT:-development}
HEADER_COLOR=${HEADER_COLOR:-#448a38}

# Change NAV color based on environment
if [ "$ENVIRONMENT" != "production" ]; then
    sed -i "/<\/head>/i <style>.bg-primary-nav { background-color: $HEADER_COLOR !important; }</style>" /usr/share/nginx/html/index.html
fi

# Start nginx
exec "$@"