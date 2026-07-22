import { Navigate } from "react-router-dom";

function ProtectedRoute({ children, requiredRole }) {
  const token = localStorage.getItem("access");
  const role = (localStorage.getItem("role") || "").toUpperCase();

  if (!token) {
    return <Navigate to="/" replace />;
  }

  if (requiredRole && role !== requiredRole.toUpperCase()) {
    return <Navigate to="/dashboard" replace />;
  }

  return children;
}

export default ProtectedRoute;
