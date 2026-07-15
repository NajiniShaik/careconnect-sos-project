import { Routes, Route, Navigate } from "react-router-dom";

import Login from "./pages/Login";
import Register from "./pages/Register";
import Dashboard from "./pages/Dashboard";
import ProtectedRoute from "./routes/ProtectedRoute";
import SocietyManagement from "./pages/SocietyManagement";
import BlockManagement from "./pages/BlockManagement";
import FlatManagement from "./pages/FlatManagement";
import ResidentManagement from "./pages/ResidentManagement";
import EmergencyContactManagement from "./pages/EmergencyContactManagement";
import AlertsManagement from "./pages/AlertsManagement";

function App() {
  const token = localStorage.getItem("access");

  return (
    <Routes>
      <Route
        path="/"
        element={
          token ? <Navigate to="/dashboard" replace /> : <Login />
        }
      />

      <Route
        path="/register"
        element={
          token ? <Navigate to="/dashboard" replace /> : <Register />
        }
      />

      <Route
        path="/societies"
        element={
          <ProtectedRoute>
            <SocietyManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/blocks"
        element={
          <ProtectedRoute>
            <BlockManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/flats"
        element={
          <ProtectedRoute>
            <FlatManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/residents"
        element={
          <ProtectedRoute>
            <ResidentManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/emergency-contacts"
        element={
          <ProtectedRoute>
            <EmergencyContactManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/alerts"
        element={
          <ProtectedRoute>
            <AlertsManagement />
          </ProtectedRoute>
        }
      />

      <Route
        path="/dashboard"
        element={
          <ProtectedRoute>
            <Dashboard />
          </ProtectedRoute>
        }
      />
    </Routes>
  );
}

export default App;