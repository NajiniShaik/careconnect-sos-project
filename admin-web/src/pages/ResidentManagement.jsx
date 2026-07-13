import { useEffect, useState } from "react";

import {
    createResident,
    getResidents,
    approveResident,
    rejectResident,
} from "../api/residentApi";

import { getSocieties } from "../api/societyApi";
import { getBlocks } from "../api/blockApi";
import { getFlats } from "../api/flatApi";

import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import FilterBar from "../components/common/FilterBar";
import DataTable from "../components/common/DataTable";
import ConfirmDialog from "../components/common/ConfirmDialog";
import Modal from "../components/common/Modal";


import ResidentForm from "../components/admin/ResidentForm";

export default function ResidentManagement() {
    const [residents, setResidents] = useState([]);
    const [societies, setSocieties] = useState([]);

    const [openModal, setOpenModal] = useState(false);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("username");

    const [selectedResident, setSelectedResident] = useState(null);

    const [approveOpen, setApproveOpen] = useState(false);
    const [rejectOpen, setRejectOpen] = useState(false);

    const [blocks, setBlocks] = useState([]);
    const [flats, setFlats] = useState([]);

    const loadData = async () => {
        try {
            const residentRes = await getResidents();
            const societyRes = await getSocieties();
            const blockRes = await getBlocks();
            const flatRes = await getFlats();

            setResidents(residentRes.data);
            setSocieties(societyRes.data);
            setBlocks(blockRes.data);
            setFlats(flatRes.data);
        } catch (err) {
            console.log(err);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const residentFilterOptions = [
        { label: "Username", value: "username" },
        { label: "Society", value: "society_name" },
        { label: "Block", value: "block_name" },
        { label: "Flat", value: "flat_number" },
        { label: "Status", value: "approval_status" },
    ];

    const filteredResidents = residents.filter((resident) => {
        const query = search.toLowerCase();

        const value = String(
            resident[filter] || ""
        ).toLowerCase();

        return value.includes(query);
    });

    const handleSave = async (data) => {
        try {
            await createResident(data);

            setOpenModal(false);

            loadData();
        } catch (err) {
            console.log(err.response?.data);
        }
    };

    return (
        <>
            <Modal
                isOpen={openModal}
                title="Register Resident"
                onClose={() => setOpenModal(false)}
            >
                <ResidentForm
                    societies={societies}
                    blocks={blocks}
                    flats={flats}
                    onSubmit={handleSave}
                    onCancel={() => setOpenModal(false)}
                />
            </Modal>

            <ConfirmDialog
                isOpen={approveOpen}
                title="Approve Resident"
                message={`Approve ${selectedResident?.username}?`}
                onConfirm={async () => {
                    await approveResident(selectedResident.id);
                    setApproveOpen(false);
                    setSelectedResident(null);
                    loadData();
                }}
                onCancel={() => {
                    setApproveOpen(false);
                    setSelectedResident(null);
                }}
            />

            <ConfirmDialog
                isOpen={rejectOpen}
                title="Reject Resident"
                message={`Reject ${selectedResident?.username}?`}
                onConfirm={async () => {
                    await rejectResident(selectedResident.id);
                    setRejectOpen(false);
                    setSelectedResident(null);
                    loadData();
                }}
                onCancel={() => {
                    setRejectOpen(false);
                    setSelectedResident(null);
                }}
            />

            <AdminLayout>

                <PageTitle
                    title="Resident Management"
                    buttonText="+ Register Resident"
                    onButtonClick={() => setOpenModal(true)}
                />

                <FilterBar
                    search={search}
                    setSearch={setSearch}
                    filter={filter}
                    setFilter={setFilter}
                    filterOptions={residentFilterOptions}
                    placeholder={`Search by ${filter}...`}
                />

                <DataTable
                    columns={[
                        "ID",
                        "Username",
                        "Society_Name",
                        "Block_Name",
                        "Flat_Number",
                        "Approval_Status",
                    ]}
                    data={filteredResidents}

                    renderCell={(resident, column) => {
                        if (column === "Approval_Status") {
                            switch (resident.approval_status) {
                                case "PENDING":
                                    return "🟡 Pending";

                                case "APPROVED":
                                    return "🟢 Approved";

                                case "REJECTED":
                                    return "🔴 Rejected";

                                default:
                                    return resident.approval_status;
                            }
                        }

                        const value = resident[column.toLowerCase()];

                        return typeof value === "boolean"
                            ? value
                                ? "Yes"
                                : "No"
                            : value;
                    }}

                    renderActions={(resident) => (
                        <>
                            {resident.approval_status !== "APPROVED" && (
                                <button
                                    onClick={() => {
                                        setSelectedResident(resident);
                                        setApproveOpen(true);
                                    }}
                                >
                                    Approve
                                </button>
                            )}

                            {resident.approval_status !== "REJECTED" && (
                                <button
                                    onClick={() => {
                                        setSelectedResident(resident);
                                        setRejectOpen(true);
                                    }}
                                >
                                    Reject
                                </button>
                            )}
                        </>
                    )}
                />
            </AdminLayout>

        </>

    )

}