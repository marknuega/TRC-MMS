/*
 * Software Developed by Muhammad Amir MT# MT1063
 * © 2026 Muhammad Amir. All rights reserved.
 *
 * Certified Electronics and Electrical Technician
 * Electrical License#: CLN-NQ-***6092 · Electronics License#: CLN-NQ-***6595
 */

import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import "./deck.css";
import Presentation from "./Presentation.jsx";

createRoot(document.getElementById("root")).render(
  <StrictMode>
    <Presentation />
  </StrictMode>,
);
