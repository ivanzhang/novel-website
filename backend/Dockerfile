FROM node:24-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --omit=dev

COPY backend ./
COPY frontend ../frontend

EXPOSE 3000

CMD ["node", "server.js"]
