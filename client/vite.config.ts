import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";

export default defineConfig({
  plugins: [react(), tailwindcss()],
  server: {
    port: 5173,
    // 写 127.0.0.1 而不是 localhost：后端只监听 IPv4 的本机地址，localhost 在有的电脑上会先解析成 IPv6 的 ::1，连不上
    proxy: { "/api": "http://127.0.0.1:3001" },
  },
});
