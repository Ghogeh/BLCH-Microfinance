# Stage 1: Build the React/Vite app
FROM node:20-alpine AS builder

WORKDIR /app

# Accept build-time env vars (Vite bakes these into the bundle at build time)
ARG VITE_API_URL
ARG VITE_CHAIN_ID
ARG VITE_RPC_URL
ARG VITE_IDENTITY_REGISTRY_ADDRESS
ARG VITE_LOAN_FACTORY_ADDRESS

ENV VITE_API_URL=$VITE_API_URL
ENV VITE_CHAIN_ID=$VITE_CHAIN_ID
ENV VITE_RPC_URL=$VITE_RPC_URL
ENV VITE_IDENTITY_REGISTRY_ADDRESS=$VITE_IDENTITY_REGISTRY_ADDRESS
ENV VITE_LOAN_FACTORY_ADDRESS=$VITE_LOAN_FACTORY_ADDRESS

# Install dependencies (separate layer for better caching)
COPY package*.json ./
RUN npm ci --production=false

# Copy source and build
COPY . .
RUN npm run build

# Stage 2: Serve the built SPA with Nginx
FROM nginx:alpine

COPY --from=builder /app/dist /usr/share/nginx/html

# SPA routing: all unknown paths fall back to index.html
# Static assets get 1-year immutable cache headers
RUN printf 'server {\n\
  listen 80;\n\
  root /usr/share/nginx/html;\n\
  index index.html;\n\
  location / {\n\
    try_files $uri $uri/ /index.html;\n\
  }\n\
  location ~* \\.(js|css|png|jpg|jpeg|gif|ico|svg)$ {\n\
    expires 1y;\n\
    add_header Cache-Control "public, immutable";\n\
  }\n\
}\n' > /etc/nginx/conf.d/default.conf

EXPOSE 80
CMD ["nginx", "-g", "daemon off;"]
