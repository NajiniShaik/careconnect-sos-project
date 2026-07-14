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

    const role = localStorage.getItem("role")?.toUpperCase() || "";
    const canManageResidents = role === "ADMIN";

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
                    disabled={!canManageResidents}
                    onButtonClick={() => {
                        if (!canManageResidents) return;
                        setOpenModal(true);
                    }}
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
                            const status = resident.approval_status;
                            const tone = status === "APPROVED" ? "success" : status === "REJECTED" ? "danger" : "warning";
                            const label = status === "APPROVED" ? "Approved" : status === "REJECTED" ? "Rejected" : "Pending";
                            return (
                                <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "999px", background: tone === "success" ? "rgba(16,185,129,0.08)" : tone === "danger" ? "rgba(220,38,38,0.08)" : "rgba(217,119,6,0.08)", color: tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--warning)", fontWeight: 700 }}>
                                    <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: tone === "success" ? "var(--success)" : tone === "danger" ? "var(--danger)" : "var(--warning)" }} />
                                    {label}
                                </span>
                            );
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
                                        if (!canManageResidents) return;
                                        setSelectedResident(resident);
                                        setApproveOpen(true);
                                    }}
                                    disabled={!canManageResidents}
                                    style={{ border: "none", background: canManageResidents ? "#dcfce7" : "#e2e8f0", color: canManageResidents ? "#166534" : "#64748b", borderRadius: "999px", padding: "8px 12px", marginRight: "8px", cursor: canManageResidents ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageResidents ? 1 : 0.6 }}
                                >
                                    Approve
                                </button>
                            )}

                            {resident.approval_status !== "REJECTED" && (
                                <button
                                    onClick={() => {
                                        if (!canManageResidents) return;
                                        setSelectedResident(resident);
                                        setRejectOpen(true);
                                    }}
                                    disabled={!canManageResidents}
                                    style={{ border: "none", background: canManageResidents ? "#fee2e2" : "#e2e8f0", color: canManageResidents ? "#991b1b" : "#64748b", borderRadius: "999px", padding: "8px 12px", cursor: canManageResidents ? "pointer" : "not-allowed", fontWeight: 700, opacity: canManageResidents ? 1 : 0.6 }}
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