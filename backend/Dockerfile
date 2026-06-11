FROM node:20-slim

WORKDIR /app

# Copy package.json và package-lock.json
COPY package*.json ./

# Cài đặt dependencies (chỉ package cho production)
RUN npm install --production

# Copy toàn bộ mã nguồn
COPY . .

# Expose port 5000
EXPOSE 5000

# Chạy ứng dụng
CMD ["npm", "start"]
