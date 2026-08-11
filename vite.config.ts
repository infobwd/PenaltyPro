
import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import path from 'path'
import { fileURLToPath } from 'url'

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)

// https://vitejs.dev/config/
export default defineConfig({
  plugins: [react()],
  // แอปอยู่ที่รากของ subdomain kickoff.bwd.ac.th
  // ค่าเดิม '/PenaltyPro/' เป็นของ GitHub Pages ที่เสิร์ฟใต้ subpath —
  // พออัปขึ้น host จริงแล้ว asset ทุกตัวจะถูกอ้างเป็น /PenaltyPro/assets/... แล้ว 404
  base: '/',
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './'),
    },
  },
})
