import axios from "axios";
import { useNavigate } from "react-router-dom";

import AdminLayout from "../components/common/AdminLayout";

function Dashboard() {
  const navigate = useNavigate();


  const handleLogout = async () => {
    try {
      const refresh = localStorage.getItem("refresh");

      const access = localStorage.getItem("access");

      await axios.post("http://127.0.0.1:8000/api/users/logout/", {
        refresh,
      },
      {
        headers: {
            Authorization: `Bearer ${access}`,
        },
    }
    );

      localStorage.removeItem("access");
      localStorage.removeItem("refresh");
      localStorage.removeItem("user");
      console.log("Logging Out");

      navigate("/");
    } catch (error) {
      console.log(error.response?.data || error.message);
    }
  };

  return (

    <AdminLayout>
      <div>
      <h1>CareConnect Dashboard</h1>
      <p>You are successfully logged in.</p>

      <button onClick={handleLogout}>
        Logout
      </button>
    </div>
    </AdminLayout>
  );
}

export default Dashboard;