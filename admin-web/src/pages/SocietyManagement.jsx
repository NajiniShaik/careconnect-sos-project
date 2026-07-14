import { useEffect, useState } from "react";
import {
  getSocieties,
  createSociety,
  updateSociety,
  deleteSociety,
} from "../api/societyApi";

import AdminLayout from "../components/common/AdminLayout";
import ConfirmDialog from "../components/common/ConfirmDialog";

import Modal from "../components/common/Modal";
import SocietyForm from "../components/admin/SocietyForm";
import PageTitle from "../components/common/PageTitle";

import DataTable from "../components/common/DataTable";
import FilterBar from "../components/common/FilterBar";

function SocietyManagement() {
  const [societies, setSocieties] = useState([]);
  const [openModal, setOpenModal] = useState(false);
  const [editingSociety, setEditingSociety] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedSociety, setSelectedSociety] = useState(null);


  const [search, setSearch] = useState("");
  const role = localStorage.getItem("role")?.toUpperCase() || "";
  const canManageSocieties = role === "ADMIN";
  const [filter, setFilter] = useState("name");

  const loadSocieties = async () => {
    const res = await getSocieties();
    setSocieties(res.data);
  };

  useEffect(() => {
    loadSocieties();
  }, []);


  const handleSave = async (data) => {
    try {
      if (editingSociety) {
        await updateSociety(editingSociety.id, data);
      } else {
        await createSociety(data);
      }

      loadSocieties();

      setOpenModal(false);
      setEditingSociety(null);

    } catch (err) {
      console.log(err.response?.data);
    }
  };

  const handleDelete = async (id) => {
    await deleteSociety(selectedSociety.id);

    setDeleteOpen(false);
    setSelectedSociety(null);

    loadSocieties();
  };

  const societyFilterOptions = [
    { value: "name", label: "Name" },
    { value: "city", label: "City" },
    { value: "address", label: "Address" },
    { value: "state", label: "State" },
  ];

  const filteredSocieties = societies.filter((society) => {
    const query = search.toLowerCase();
    const fieldValue = String(society[filter] || "").toLowerCase();
    return fieldValue.includes(query);
  });

  console.log(search);

  return (
    <>
      <Modal
        isOpen={openModal}
        title={
          editingSociety
            ? "Update Society"
            : "Create Society"
        }
        onClose={() => {
          setOpenModal(false);
          setEditingSociety(null);
        }}>
        <SocietyForm
          initialData={editingSociety}
          onSubmit={handleSave}
          onCancel={() => {
            setOpenModal(false);
            setEditingSociety(null);
          }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Society"
        message={`Are you sure you want to delete "${selectedSociety?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setSelectedSociety(null);
        }}
      />

      <AdminLayout>
        <div style={{ background: "var(--surface)", borderRadius: "18px", padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
          <PageTitle
            title="Society Management"
            buttonText="+ Create Society"
            disabled={!canManageSocieties}
            onButtonClick={() => {
              if (!canManageSocieties) return;
              setEditingSociety(null);
              setOpenModal(true);
            }}
          />

          <div style={{ color: "var(--muted)", marginBottom: "12px" }}>All societies in the network</div>

          <FilterBar
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            filterOptions={societyFilterOptions}
            placeholder={`Search by ${filter}...`}
          />

          <DataTable
            columns={["ID", "Name", "City", "Address"]}
            data={filteredSocieties}
            renderActions={(society) => (<>
              <button
                onClick={() => {
                  if (!canManageSocieties) return;
                  setEditingSociety(society);
                  setOpenModal(true);
                }}
                disabled={!canManageSocieties}
                style={{ border: "none", background: canManageSocieties ? "rgba(var(--primary-rgb),0.08)" : "var(--border)", color: canManageSocieties ? "var(--info)" : "var(--muted)", borderRadius: "999px", padding: "8px 12px", marginRight: "8px", cursor: canManageSocieties ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageSocieties ? 1 : 0.6 }}
              >
                Edit
              </button>

              <button
                onClick={() => {
                  if (!canManageSocieties) return;
                  setSelectedSociety(society);
                  setDeleteOpen(true);
                }}
                disabled={!canManageSocieties}
                style={{ border: "none", background: canManageSocieties ? "rgba(255,230,230,0.9)" : "var(--border)", color: canManageSocieties ? "var(--danger)" : "var(--muted)", borderRadius: "999px", padding: "8px 12px", cursor: canManageSocieties ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageSocieties ? 1 : 0.6 }}
              >
                Delete
              </button>
            </>
            )}
          />

        </div>
      </AdminLayout>
    </>
  );
}

export default SocietyManagement;