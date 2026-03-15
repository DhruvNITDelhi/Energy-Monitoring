FROM node:20-alpine
WORKDIR /app
RUN mkdir -p /app/firmware && chown node:node /app/firmware
COPY package*.json ./
RUN npm ci --production
COPY src/ ./src/
USER node
EXPOSE 3001
CMD ["node", "src/index.js"]
