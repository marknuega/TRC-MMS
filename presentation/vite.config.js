// Software Developed by Muhammad Amir MT# MT1063
// © 2026 Muhammad Amir. All rights reserved.
//
// Certified Electronics and Electrical Technician
// Electrical License#: CLN-NQ-***6092 · Electronics License#: CLN-NQ-***6595

import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5174,
  },
  preview: {
    allowedHosts: ["trc-mms-presentation.up.railway.app"],
  },
});
