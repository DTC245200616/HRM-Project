
FROM node:24-alpine

WORKDIR /app

# Sao chép danh sách thư viện
COPY package*.json ./

# Cài đặt thư viện production
RUN npm ci --omit=dev

# Sao chép mã nguồn và cấp quyền sở hữu cho node
COPY --chown=node:node server.js auth.js ./

# Cấu hình môi trường
ENV NODE_ENV=production
ENV PORT=3000

# Không chạy bằng root
USER node

EXPOSE 3000

CMD ["node", "server.js"]
