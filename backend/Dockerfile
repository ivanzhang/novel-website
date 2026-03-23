FROM node:18-alpine

RUN apk add --no-cache python3 make g++

WORKDIR /app/backend

COPY backend/package*.json ./
RUN npm install --production

COPY backend ./
COPY frontend ../frontend

EXPOSE 3000

CMD ["node", "server.js"]
