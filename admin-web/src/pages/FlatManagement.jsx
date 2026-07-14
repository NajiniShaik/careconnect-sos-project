import { useEffect, useState } from "react";
import {
  getFlats,
  createFlat,
  deleteFlat,
  updateFlat
} from "../api/flatApi.js";

import AdminLayout from "../components/common/AdminLayout";
import Modal from "../components/common/Modal";
import PageTitle from "../components/common/PageTitle";
import FilterBar from "../components/common/FilterBar";
import DataTable from "../components/common/DataTable";
import ConfirmDialog from "../components/common/ConfirmDialog";

import FlatForm from "../components/admin/FlatForm";

export default function FlatManagement() {
  const [flats, setFlats] = useState([]);

  const [openModal, setOpenModal] = useState(false);
  const [editingFlat, setEditingFlat] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedFlat, setSelectedFlat] = useState(null);

  const role = localStorage.getItem("role")?.toUpperCase() || "";
  const canManageFlats = role === "ADMIN";

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("flat_number");

  const loadFlats = async () => {
    try {
      const res = await getFlats();
      setFlats(res.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    loadFlats();
  }, []);

  const handleSave = async (data) => {
    try {
      if (editingFlat) {
        await updateFlat(editingFlat.id, data);
      } else {
        await createFlat(data);
      }

      setEditingFlat(null);
      setOpenModal(false);

      loadFlats();
    } catch (err) {
      console.log(err.response?.data);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteFlat(selectedFlat.id);

      setDeleteOpen(false);
      setSelectedFlat(null);

      loadFlats();
    } catch (err) {
      console.log(err);
    }
  };

  const filterOptions = [
    {
      label: "Flat Number",
      value: "flat_number",
    },
    {
      label: "Floor",
      value: "floor",
    },
    {
      label: "Type",
      value: "flat_type",
    },
    {
      label: "Occupied",
      value: "is_occupied",
    },
  ];

  const filteredFlats = flats.filter((flat) => {
    const query = search.toLowerCase();
    const fieldValue = String(flat[filter] || "").toLowerCase();
    return fieldValue.includes(query);
  });

  return (
    <>
      <Modal
        isOpen={openModal}
        title={editingFlat ? "Update Flat" : "Create Flat"}
        onClose={() => {
          setOpenModal(false);
          setEditingFlat(null);
        }}
      >
        <FlatForm
          initialData={editingFlat}
          onSubmit={handleSave}
          onCancel={() => {
            setOpenModal(false);
            setEditingFlat(null);
          }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Flat"
        message={`Delete Flat "${selectedFlat?.flat_number}" ?`}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setSelectedFlat(null);
        }}
      />

      <AdminLayout>
        <div style={{ background: "var(--surface)", borderRadius: "18px", padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
          <PageTitle
            title="Flat Management"
            buttonText="+ Create Flat"
            disabled={!canManageFlats}
            onButtonClick={() => {
              if (!canManageFlats) return;
              setEditingFlat(null);
              setOpenModal(true);
            }}
          />

          <div style={{ color: "var(--muted)", marginBottom: "12px" }}>View flat inventory and occupancy clearly</div>

          <FilterBar
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            filterOptions={filterOptions}
            placeholder={`Search by ${filter}...`}
          />

          <DataTable
            columns={[
              "ID",
              "Flat_Number",
              "Floor",
              "Flat_Type",
              "Is_Occupied",
            ]}
            data={filteredFlats}
            renderCell={(flat, column) => {
              if (column === "Is_Occupied") {
                return (
                  <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "999px", background: flat.is_occupied ? "rgba(16,185,129,0.08)" : "rgba(15,23,42,0.04)", color: flat.is_occupied ? "var(--success)" : "var(--muted)", fontWeight: 700 }}>
                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: flat.is_occupied ? "var(--success)" : "var(--muted)" }} />
                    {flat.is_occupied ? "Occupied" : "Vacant"}
                  </span>
                );
              }
              return flat[column.toLowerCase()];
            }}
            renderActions={(flat) => (
              <>
                <button
                  onClick={() => {
                    if (!canManageFlats) return;
                    setEditingFlat(flat);
                    setOpenModal(true);
                  }}
                  disabled={!canManageFlats}
                  style={{ border: "none", background: canManageFlats ? "#eff6ff" : "#e2e8f0", color: canManageFlats ? "#2563eb" : "#64748b", borderRadius: "999px", padding: "8px 12px", marginRight: "8px", cursor: canManageFlats ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageFlats ? 1 : 0.6 }}
                >
                  Edit
                </button>

                <button
                  onClick={() => {
                    if (!canManageFlats) return;
                    setSelectedFlat(flat);
                    setDeleteOpen(true);
                  }}
                  disabled={!canManageFlats}
                  style={{ border: "none", background: canManageFlats ? "#fee2e2" : "#e2e8f0", color: canManageFlats ? "#b91c1b" : "#64748b", borderRadius: "999px", padding: "8px 12px", cursor: canManageFlats ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageFlats ? 1 : 0.6 }}
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