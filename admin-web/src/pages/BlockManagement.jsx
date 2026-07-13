import { useEffect, useState } from "react";
import {
  getBlocks,
  createBlock,
  deleteBlock,
  updateBlock
} from "../api/blockApi.js";

import { getSocieties } from "../api/societyApi.js"

import AdminLayout from "../components/common/AdminLayout";
import Modal from "../components/common/Modal";
import PageTitle from "../components/common/PageTitle";
import DataTable from "../components/common/DataTable";
import FilterBar from "../components/common/FilterBar";
import ConfirmDialog from "../components/common/ConfirmDialog";

import BlockForm from "../components/admin/BlockForm";

export default function BlockManagement() {
  const [blocks, setBlocks] = useState([]);
  const [societies, setSocieties] = useState([]);

  const [openModal, setOpenModal] = useState(false);
  const [editingBlock, setEditingBlock] = useState(null);

  const [deleteOpen, setDeleteOpen] = useState(false);
  const [selectedBlock, setSelectedBlock] = useState(null);

  const [search, setSearch] = useState("");
  const [filter, setFilter] = useState("name");

  const loadData = async () => {
    try {
      const blockRes = await getBlocks();

      const societyRes = await getSocieties();

      setBlocks(blockRes.data);
      setSocieties(societyRes.data);
    } catch (err) {
      console.log(err);
    }
  };

  useEffect(() => {
    loadData();
  }, []);

  const handleSave = async (data) => {
    try {
      if (editingBlock) {
        await updateBlock(editingBlock.id, data);
      } else {
        await createBlock(data);
      }

      setEditingBlock(null);
      setOpenModal(false);

      loadData();
    } catch (err) {
      console.log(err.response?.data);
    }
  };

  const handleDelete = async () => {
    try {
      await deleteBlock(selectedBlock.id);

      setDeleteOpen(false);
      setSelectedBlock(null);

      loadData();
    } catch (err) {
      console.log(err);
    }
  };

  const filterOptions = [
    {
      label: "Block Name",
      value: "name",
    },
    {
      label: "Society",
      value: "society_name",
    },
    {
      label: "Total Flats",
      value: "total_flats",
    },
  ];

  const filteredBlocks = blocks.filter((block) => {
    const query = search.toLowerCase();
    const fieldValue = String(block[filter] || "").toLowerCase();
    return fieldValue.includes(query);
  });

  return (
    <>
      <Modal
        isOpen={openModal}
        title={
          editingBlock
            ? "Update Block"
            : "Create Block"
        }
        onClose={() => {
          setOpenModal(false);
          setEditingBlock(null);
        }}
      >
        <BlockForm
          societies={societies}
          initialData={editingBlock}
          onSubmit={handleSave}
          onCancel={() => {
            setOpenModal(false);
            setEditingBlock(null);
          }}
        />
      </Modal>

      <ConfirmDialog
        isOpen={deleteOpen}
        title="Delete Block"
        message={`Delete "${selectedBlock?.name}"?`}
        onConfirm={handleDelete}
        onCancel={() => {
          setDeleteOpen(false);
          setSelectedBlock(null);
        }}
      />

      <AdminLayout>
        <PageTitle
          title="Block Management"
          buttonText="+ Create Block"
          onButtonClick={() => {
            setEditingBlock(null);
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
            "Name",
            "Total_Flats",
            "Society_Name",
          ]}
          data={filteredBlocks}
          renderActions={(block) => (
            <>
              <button
                onClick={() => {
                  setEditingBlock(block);
                  setOpenModal(true);
                }}
              >
                Edit
              </button>

              <button
                onClick={() => {
                  setSelectedBlock(block);
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
