# Stage 1 — build React app
FROM node:18 AS webbuild
WORKDIR /app

# Copy and install deps from the frontend folder (context = project root)
COPY kyc_live_interview_web/package*.json ./
RUN npm ci

# Build
COPY kyc_live_interview_web .
RUN npm run build

# Stage 2 — serve with Nginx
FROM nginx:stable-alpine

# Clean default html
RUN rm -rf /usr/share/nginx/html/*

# Copy NGINX config and SSL from the nginx/ folder (context = project root)
COPY nginx/nginx.conf /etc/nginx/conf.d/default.conf
COPY nginx/ssl /etc/nginx/ssl

# Copy built frontend
COPY --from=webbuild /app/build /usr/share/nginx/html

EXPOSE 80 443
CMD ["nginx", "-g", "daemon off;"]
