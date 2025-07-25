FROM nginx:alpine

# Copy static files
COPY ./frontend/source /usr/share/nginx/html

# Copy nginx configuration
COPY ./frontend/nginx.conf /etc/nginx/nginx.conf

# Expose port 8081
EXPOSE 8081

# Start nginx
CMD ["nginx", "-g", "daemon off;"]
