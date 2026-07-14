import { useEffect, useState } from "react";

import {
    getEmergencyContacts,
    createEmergencyContact,
    updateEmergencyContact,
    deleteEmergencyContact,
    verifyEmergencyContact,
} from "../api/emergencyContactApi";

import { getResidents } from "../api/residentApi";

import AdminLayout from "../components/common/AdminLayout";
import PageTitle from "../components/common/PageTitle";
import FilterBar from "../components/common/FilterBar";
import DataTable from "../components/common/DataTable";
import Modal from "../components/common/Modal";
import ConfirmDialog from "../components/common/ConfirmDialog";

import EmergencyContactForm from "../components/admin/EmergencyContactForm";

export default function EmergencyContactManagement() {

    const [contacts, setContacts] = useState([]);
    const [residents, setResidents] = useState([]);

    const [openModal, setOpenModal] = useState(false);
    const [editingContact, setEditingContact] = useState(null);

    const [deleteOpen, setDeleteOpen] = useState(false);
    const [verifyOpen, setVerifyOpen] = useState(false);

    const [selectedContact, setSelectedContact] = useState(null);

    const [search, setSearch] = useState("");
    const [filter, setFilter] = useState("name");

    const role = localStorage.getItem("role")?.toUpperCase() || "";
    const canCreateContact = role !== "SECURITY";
    const canEditDelete = role === "ADMIN" || role === "RESIDENT";
    const canVerify = role === "ADMIN";

    const loadData = async () => {
        try {
            const contactRes = await getEmergencyContacts();
            setContacts(contactRes.data);
        } catch (err) {
            console.log("Emergency Contacts:", err);
        }

        try {
            const residentRes = await getResidents();
            setResidents(residentRes.data);
        } catch (err) {
            console.log("Residents:", err);
            setResidents([]);
        }
    };

    useEffect(() => {
        loadData();
    }, []);

    const filterOptions = [
        {
            label: "Contact Name",
            value: "name",
        },
        {
            label: "Resident",
            value: "resident_name",
        },
        {
            label: "Relationship",
            value: "relationship",
        },
        {
            label: "Contact Type",
            value: "contact_type",
        },
    ];

    const filteredContacts = contacts.filter((contact) => {

        const query = search.toLowerCase();

        const value = String(
            contact[filter] || ""
        ).toLowerCase();

        return value.includes(query);

    });

    const handleSave = async (data) => {

        try {

            if (editingContact) {

                await updateEmergencyContact(
                    editingContact.id,
                    data
                );

            } else {

                await createEmergencyContact(data);

            }

            setEditingContact(null);
            setOpenModal(false);

            loadData();

        } catch (err) {

            console.log(err.response?.data);

        }

    };

    const handleDelete = async () => {

        try {

            await deleteEmergencyContact(
                selectedContact.id
            );

            setDeleteOpen(false);
            setSelectedContact(null);

            loadData();

        } catch (err) {

            console.log(err);

        }

    };

    const handleVerify = async () => {

        try {

            await verifyEmergencyContact(
                selectedContact.id
            );

            setVerifyOpen(false);
            setSelectedContact(null);

            loadData();

        } catch (err) {

            console.log(err);

        }

    };

    return (
        <>

            <Modal
                isOpen={openModal}
                title={
                    editingContact
                        ? "Update Contact"
                        : "Create Contact"
                }
                onClose={() => {
                    setOpenModal(false);
                    setEditingContact(null);
                }}
            >

                <EmergencyContactForm
                    residents={residents}
                    initialData={editingContact}
                    onSubmit={handleSave}
                    onCancel={() => {
                        setOpenModal(false);
                        setEditingContact(null);
                    }}
                />

            </Modal>

            <ConfirmDialog
                isOpen={deleteOpen}
                title="Delete Contact"
                message={`Delete "${selectedContact?.name}"?`}
                onConfirm={handleDelete}
                onCancel={() => {
                    setDeleteOpen(false);
                    setSelectedContact(null);
                }}
            />

            <ConfirmDialog
                isOpen={verifyOpen}
                title="Verify Contact"
                message={`Verify "${selectedContact?.name}"?`}
                onConfirm={handleVerify}
                onCancel={() => {
                    setVerifyOpen(false);
                    setSelectedContact(null);
                }}
            />

            <AdminLayout>
                <div style={{ background: "var(--surface)", borderRadius: "18px", padding: "20px", border: "1px solid var(--border)", boxShadow: "var(--card-shadow)" }}>
                    <PageTitle
                        title="Emergency Contact Management"
                        buttonText="+ Add Contact"
                        disabled={!canCreateContact}
                        onButtonClick={() => {
                            if (!canCreateContact) return;
                            setEditingContact(null);
                            setOpenModal(true);
                        }}
                    />

                    <div style={{ color: "var(--muted)", marginBottom: "12px" }}>Keep resident emergency contacts verified and up to date</div>

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
                            "Resident_Name",
                            "Name",
                            "Phone",
                            "Relationship",
                            "Contact_Type",
                            "Is_Verified",
                        ]}
                        data={filteredContacts}
                        renderCell={(contact, column) => {

                            if (column === "Is_Verified") {
                                return (
                                    <span style={{ display: "inline-flex", alignItems: "center", gap: "6px", padding: "6px 10px", borderRadius: "999px", background: contact.is_verified ? "rgba(16,185,129,0.08)" : "rgba(217,119,6,0.08)", color: contact.is_verified ? "var(--success)" : "var(--warning)", fontWeight: 700 }}>
                                        <span style={{ width: "8px", height: "8px", borderRadius: "50%", background: contact.is_verified ? "var(--success)" : "var(--warning)" }} />
                                        {contact.is_verified ? "Verified" : "Pending"}
                                    </span>
                                );
                            }

                            return contact[column.toLowerCase()];
                        }}
                        renderActions={(contact) => (
                            <>
                                <button
                                    onClick={() => {
                                        if (!canEditDelete) return;
                                        setEditingContact(contact);
                                        setOpenModal(true);
                                    }}
                                    disabled={!canEditDelete}
                                    style={{ border: "none", background: canEditDelete ? "#eff6ff" : "#e2e8f0", color: canEditDelete ? "#2563eb" : "#64748b", borderRadius: "999px", padding: "8px 12px", marginRight: "8px", cursor: canEditDelete ? "pointer" : "not-allowed", fontWeight: 700, opacity: canEditDelete ? 1 : 0.6 }}
                                >
                                    Edit
                                </button>

                                <button
                                    onClick={() => {
                                        if (!canEditDelete) return;
                                        setSelectedContact(contact);
                                        setDeleteOpen(true);
                                    }}
                                    disabled={!canEditDelete}
                                    style={{ border: "none", background: canEditDelete ? "#fee2e2" : "#e2e8f0", color: canEditDelete ? "#b91c1c" : "#64748b", borderRadius: "999px", padding: "8px 12px", cursor: canEditDelete ? "pointer" : "not-allowed", fontWeight: 700, opacity: canEditDelete ? 1 : 0.6 }}
                                >
                                    Delete
                                </button>

                                {!contact.is_verified && (
                                    <button
                                        onClick={() => {
                                            if (!canVerify) return;
                                            setSelectedContact(contact);
                                            setVerifyOpen(true);
                                        }}
                                        disabled={!canVerify}
                                        style={{ border: "none", background: canVerify ? "#fef3c7" : "#e2e8f0", color: canVerify ? "#92400e" : "#64748b", borderRadius: "999px", padding: "8px 12px", marginLeft: "8px", cursor: canVerify ? "pointer" : "not-allowed", fontWeight: 700, opacity: canVerify ? 1 : 0.6 }}
                                    >
                                        Verify
                                    </button>
                                )}
                            </>
                        )}
                    />
                </div>
            </AdminLayout>

        </>
    );

}