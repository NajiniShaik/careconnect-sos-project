import { useEffect, useState } from "react";
import {
  getFlats,
  createFlat,
  deleteFlat,
  updateFlat
} from "../api/flatApi.js";

import { getBlocks} from "../api/blockApi.js";

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
        <PageTitle
          title="Flat Management"
          buttonText="+ Create Flat"
          onButtonClick={() => {
            setEditingFlat(null);
            setOpenModal(true);
          }}
        />

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
          renderActions={(flat) => (
            <>
              <button
                onClick={() => {
                  setEditingFlat(flat);
                  setOpenModal(true);
                }}
              >
                Edit
              </button>

              <button
                onClick={() => {
                  setSelectedFlat(flat);
                  setDeleteOpen(true);
                }}
              >
                Delete
              </button>
            </>
          )}
        />
      </AdminLayout>
    </>
  );
}