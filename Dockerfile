FROM ghcr.io/puppeteer/puppeteer:21.6.0

USER root

# Set working directory
WORKDIR /app

# Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# Copy project files
COPY . .

# Ensure data directory is writable for the puppeteer user (uid 1000)
RUN mkdir -p data/uploads data/session data/campaigns
RUN chown -R pptruser:pptruser /app/data
RUN chmod -R 777 /app/data

# Switch back to pptruser for security
USER pptruser

EXPOSE 4040

CMD ["sh", "-c", "node backend/server.js"]
