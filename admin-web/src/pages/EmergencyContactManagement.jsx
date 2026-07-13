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

    const user = JSON.parse(localStorage.getItem("user"));
    const role = user?.role;
    console.log(role)

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

                <PageTitle
                    title="Emergency Contact Management"
                    buttonText={role !== "SECURITY" ? "+ Add Contact" : ""}
                    onButtonClick={() => {
                        if (role !== "SECURITY") {
                            setEditingContact(null);
                            setOpenModal(true);
                        }
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
                            return contact.is_verified
                                ? "✅ Verified"
                                : "❌ Not Verified";
                        }

                        return contact[column.toLowerCase()];
                    }}
                    renderActions={(contact) => (
                        <>
                            {(role === "ADMIN" || role === "RESIDENT") && (
                                <>
                                    <button
                                        onClick={() => {
                                            setEditingContact(contact);
                                            setOpenModal(true);
                                        }}
                                    >
                                        Edit
                                    </button>

                                    <button
                                        onClick={() => {
                                            setSelectedContact(contact);
                                            setDeleteOpen(true);
                                        }}
                                    >
                                        Delete
                                    </button>
                                </>
                            )}

                            {role === "ADMIN" && !contact.is_verified && (
                                <button
                                    onClick={() => {
                                        setSelectedContact(contact);
                                        setVerifyOpen(true);
                                    }}
                                >
                                    Verify
                                </button>
                            )}
                        </>
                    )}
                />

            </AdminLayout>

        </>
    );

}