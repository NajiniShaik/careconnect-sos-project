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
        <div style={{ padding: 30 }}>
          <PageTitle
            title="Society Management"
            buttonText="+ Create Society"
            onButtonClick={() => {
              setEditingSociety(null);
              setOpenModal(true);
            }}
          />

          <hr />

          <h3>All Societies</h3>

          <FilterBar
            search={search}
            setSearch={setSearch}
            filter={filter}
            setFilter={setFilter}
            filterOptions={societyFilterOptions}
            placeholder={`Search by ${filter}...`}
          />

          <DataTable
            columns={["ID", "Name", "City", "Address",]}
            data={filteredSocieties}
            renderActions={(society) => (<>
              <button
                onClick={() => {
                  setEditingSociety(society);
                  setOpenModal(true);
                }}
              >
                Edit
              </button>

              <button
                onClick={() => {
                  setSelectedSociety(society);
                  setDeleteOpen(true);
                }}
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