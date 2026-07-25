import { useEffect, useMemo, useState } from "react";
import { Routes, Route, Navigate, useLocation, useNavigate } from "react-router-dom";
import AdminLayout from "../components/common/AdminLayout";
import NotificationTemplatesPanel from "../components/notifications/NotificationTemplatesPanel";
import axios from "axios";

const API = "http://127.0.0.1:8000/api/notifications";

function getAuthHeaders() {
  const token = localStorage.getItem("access");
  return token ? { Authorization: `Bearer ${token}` } : {};
}

function getStoredUser() {
  try {
    return JSON.parse(localStorage.getItem("user") || "{}") || {};
  } catch {
    return {};
  }
}

export function canDeleteNotification(notification, currentUserId) {
  const ownerId = notification?.user?.id ?? notification?.user_id ?? notification?.user?.user_id;

  if (ownerId === undefined || ownerId === null || ownerId === "") {
    return Boolean(currentUserId);
  }

  return Number(ownerId) === Number(currentUserId);
}

export default function Notifications({ initialTab = "logs" }) {
  const location = useLocation();
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState("");

  const isAdmin = (localStorage.getItem("role") || "").toUpperCase() === "ADMIN";
  const storedUser = getStoredUser();
  const currentUserId = Number(storedUser?.id ?? storedUser?.user_id ?? 0);

  useEffect(() => {
    void loadItems();
  }, []);

  const loadItems = async () => {
    setLoading(true);
    setError("");
    try {
      const response = await axios.get(`${API}/notifications/`, { headers: getAuthHeaders() });
      setItems(Array.isArray(response.data) ? response.data : []);
    } catch (err) {
      console.error("Failed to load notifications", err);
      setError("Unable to load notifications right now.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  };

  const markAllRead = async () => {
    try {
      await axios.post(`${API}/mark-all-read/`, {}, { headers: getAuthHeaders() });
      await loadItems();
    } catch (err) {
      console.error("Failed to mark all notifications read", err);
      setError("Unable to update notifications.");
    }
  };

  const unreadCount = useMemo(() => items.filter((item) => !item.read).length, [items]);
  const [createTemplateSignal, setCreateTemplateSignal] = useState(0);

  const activePath = location.pathname;
  const navigate = useNavigate();
  const activeTab = activePath.startsWith("/notifications/templates") ? "templates" : "logs";
  const titleText = activeTab === "templates" ? "Notification Templates" : "Notification Logs";
  const subtitleText = activeTab === "templates"
    ? "Manage notification templates for email, SMS, and push notifications."
    : "Review recent notification activity and delivery status.";

  const formatDateTime = (value) => {
    if (!value) return "–";
    const date = new Date(value);
    return Number.isNaN(date.getTime()) ? String(value) : date.toLocaleString();
  };

  const getNotificationSender = (item) => item?.data?.sender || item?.data?.from || item?.data?.email_from || "System";
  const getNotificationRecipient = (item) => item?.data?.recipient || item?.data?.recipient_email || item?.user?.email || item?.user?.username || "You";
  const getNotificationChannel = (item) => item?.data?.channel || item?.kind || "Unknown";
  const getNotificationStatus = (item) => item?.data?.status || (item?.read ? "Read" : "Unread");
  const getNotificationMessage = (item) => item?.body || item?.message || item?.content || item?.data?.message || item?.data?.body || item?.data?.content || item?.title || "—";
  const getNotificationTitle = (item) => item?.title || item?.data?.title || item?.data?.subject || "—";
  const getDeliveryBadgeStyle = (status) => {
    const normalized = String(status || "").toLowerCase();
    if (normalized === "failed") {
      return { background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" };
    }
    if (normalized === "pending") {
      return { background: "#fef3c7", color: "#b45309", border: "1px solid #fde68a" };
    }
    return { background: "#ecfdf3", color: "#15803d", border: "1px solid #a7f3d0" };
  };

  const handleDeleteNotification = async (item) => {
    if (!canDeleteNotification(item, currentUserId)) {
      setError("You can only delete your own notifications.");
      return;
    }

    const confirmed = window.confirm("Delete this notification?");
    if (!confirmed) return;

    try {
      await axios.delete(`${API}/notifications/${item.id}/`, { headers: getAuthHeaders() });
      setItems((prev) => prev.filter((n) => n.id !== item.id));
    } catch (err) {
      console.error("Failed to delete notification", err);
      setError("Unable to delete notification.");
    }
  };

  return (
    <AdminLayout>
      <div style={{ display: "flex", flexDirection: "column", gap: 18 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 16, alignItems: "flex-start", flexWrap: "wrap" }}>
          <div>
            <div style={{ fontSize: 28, fontWeight: 800, color: "#0f172a" }}>{titleText}</div>
            <div style={{ marginTop: 6, fontSize: 14, color: "#64748b" }}>{subtitleText}</div>
          </div>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap", alignItems: "center" }}>
            <button
              type="button"
              onClick={() => navigate("/notifications/logs")}
              style={{
                border: "1px solid #e2e8f0",
                borderRadius: 999,
                background: activePath === "/notifications/logs" ? "rgba(37, 99, 235, 0.12)" : "white",
                color: activePath === "/notifications/logs" ? "#1d4ed8" : "#334155",
                padding: "10px 18px",
                cursor: "pointer",
                fontWeight: activePath === "/notifications/logs" ? 700 : 600,
              }}
            >
              Logs
            </button>
            {isAdmin ? (
              <button
                type="button"
                onClick={() => navigate("/notifications/templates")}
                style={{
                  border: "1px solid #e2e8f0",
                  borderRadius: 999,
                  background: activePath === "/notifications/templates" ? "rgba(37, 99, 235, 0.12)" : "white",
                  color: activePath === "/notifications/templates" ? "#1d4ed8" : "#334155",
                  padding: "10px 18px",
                  cursor: "pointer",
                  fontWeight: activePath === "/notifications/templates" ? 700 : 600,
                }}
              >
                Templates
              </button>
            ) : null}
            {activeTab === "templates" ? (
              <button
                type="button"
                onClick={() => setCreateTemplateSignal((prev) => prev + 1)}
                style={{
                  border: "none",
                  borderRadius: 999,
                  background: "#2563eb",
                  color: "#ffffff",
                  padding: "10px 18px",
                  cursor: "pointer",
                  fontWeight: 700,
                  boxShadow: "0 8px 18px rgba(37, 99, 235, 0.18)",
                }}
              >
                + New Template
              </button>
            ) : null}
          </div>
        </div>

        <Routes>
          <Route path="logs" element={
            <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12, flexWrap: "wrap" }}>
                <div>
                  <div style={{ fontSize: 16, color: "#475569", fontWeight: 600 }}>
                    {unreadCount > 0 ? `${unreadCount} unread notification${unreadCount === 1 ? "" : "s"}` : "All caught up"}
                  </div>
                  <div style={{ marginTop: 4, fontSize: 13, color: "#64748b" }}>Refresh for new SOS email and SMS notifications as they appear.</div>
                </div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  <button
                    type="button"
                    onClick={() => void loadItems()}
                    disabled={loading}
                    style={{
                      border: "1px solid #e2e8f0",
                      borderRadius: 999,
                      background: "white",
                      color: "#334155",
                      padding: "10px 18px",
                      cursor: loading ? "not-allowed" : "pointer",
                      opacity: loading ? 0.65 : 1,
                      fontWeight: 700,
                    }}
                  >
                    Refresh
                  </button>
                  <button
                    type="button"
                    onClick={() => void markAllRead()}
                    disabled={loading || items.length === 0}
                    style={{
                      border: "none",
                      borderRadius: 12,
                      padding: "10px 16px",
                      background: "#2563eb",
                      color: "white",
                      cursor: loading || items.length === 0 ? "not-allowed" : "pointer",
                      opacity: loading || items.length === 0 ? 0.65 : 1,
                      fontWeight: 700,
                    }}
                  >
                    Mark all read
                  </button>
                </div>
              </div>

              {error ? (
                <div style={{ padding: 14, borderRadius: 14, background: "#fef2f2", color: "#b91c1c", border: "1px solid #fecaca" }}>{error}</div>
              ) : null}

              {loading ? (
                <div style={{ padding: 16, color: "#64748b" }}>Loading notification history…</div>
              ) : items.length === 0 ? (
                <div style={{ padding: 24, borderRadius: 16, background: "#fff", color: "#64748b", textAlign: "center" }}>
                  No notifications have been recorded yet.
                </div>
              ) : (
                <div style={{ overflowX: "auto", borderRadius: 18, border: "1px solid #e2e8f0", background: "#fff" }}>
                  <div style={{ minWidth: 1380 }}>
                    <div style={{ display: "grid", gridTemplateColumns: "1.1fr 1.1fr 1fr 0.9fr 1fr 1.2fr 1.4fr 0.8fr", gap: 0, padding: "16px 18px", fontSize: 12, fontWeight: 700, color: "#475569", textTransform: "uppercase", borderBottom: "1px solid #e2e8f0" }}>
                      <div>Notification</div>
                      <div>Channel</div>
                      <div>Recipient</div>
                      <div>Role</div>
                      <div>Address</div>
                      <div>Status</div>
                      <div>Timestamp</div>
                      <div>Action</div>
                    </div>
                    {items.map((item) => {
                      const sender = getNotificationSender(item);
                      const recipient = getNotificationRecipient(item);
                      const status = getNotificationStatus(item);
                      const channel = getNotificationChannel(item);
                      const timestamp = formatDateTime(item.received_at || item.created_at);
                      const title = getNotificationTitle(item);
                      const message = getNotificationMessage(item);
                      const canDelete = canDeleteNotification(item, currentUserId);
                      const deliveries = Array.isArray(item.deliveries) ? item.deliveries : [];
                      return (
                        <div
                          key={item.id || `${item.title}-${item.created_at || item.received_at}`}
                          style={{
                            display: "grid",
                            gridTemplateColumns: "1.1fr 1.1fr 1fr 0.9fr 1fr 1.2fr 1.4fr 0.8fr",
                            alignItems: "start",
                            gap: 0,
                            padding: "16px 18px",
                            borderBottom: "1px solid #f1f5f9",
                            background: item.read ? "white" : "#eff6ff",
                            color: "#334155",
                          }}
                        >
                          <div style={{ fontSize: 13, color: "#0f172a" }}>
                            <div style={{ fontWeight: 700 }}>{title}</div>
                            <div style={{ marginTop: 4, color: "#64748b", whiteSpace: "normal", wordBreak: "break-word" }}>{message}</div>
                            <div style={{ marginTop: 6, fontSize: 12, color: "#64748b" }}>From: {sender}</div>
                          </div>
                          <div style={{ fontSize: 13 }}>{channel}</div>
                          <div style={{ fontSize: 13 }}>
                            {deliveries.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {deliveries.map((delivery, deliveryIndex) => (
                                  <div key={`${item.id}-${deliveryIndex}`} style={{ fontSize: 12 }}>
                                    <div style={{ fontWeight: 600, color: "#0f172a" }}>{delivery.recipient_name || delivery.recipient || recipient}</div>
                                    <div style={{ color: "#64748b" }}>{delivery.recipient || recipient}</div>
                                  </div>
                                ))}
                              </div>
                            ) : (
                              recipient
                            )}
                          </div>
                          <div style={{ fontSize: 13 }}>
                            {deliveries.length > 0 ? deliveries.map((delivery, deliveryIndex) => <div key={`${item.id}-role-${deliveryIndex}`} style={{ fontSize: 12, color: "#64748b", marginBottom: deliveryIndex === deliveries.length - 1 ? 0 : 6 }}>{delivery.recipient_role || "—"}</div>) : "—"}
                          </div>
                          <div style={{ fontSize: 13 }}>
                            {deliveries.length > 0 ? deliveries.map((delivery, deliveryIndex) => <div key={`${item.id}-address-${deliveryIndex}`} style={{ fontSize: 12, color: "#64748b", marginBottom: deliveryIndex === deliveries.length - 1 ? 0 : 6 }}>{delivery.recipient_address || "—"}</div>) : "—"}
                          </div>
                          <div style={{ fontSize: 13 }}>
                            {deliveries.length > 0 ? (
                              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                                {deliveries.map((delivery, deliveryIndex) => (
                                  <span key={`${item.id}-status-${deliveryIndex}`} style={{ ...getDeliveryBadgeStyle(delivery.status), display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700, width: "fit-content" }}>
                                    {delivery.status || status}
                                  </span>
                                ))}
                              </div>
                            ) : (
                              <span style={{ ...getDeliveryBadgeStyle(status), display: "inline-block", padding: "4px 8px", borderRadius: 999, fontSize: 11, fontWeight: 700 }}>{status}</span>
                            )}
                          </div>
                          <div style={{ fontSize: 13, color: "#64748b" }}>
                            {deliveries.length > 0 ? deliveries.map((delivery, deliveryIndex) => <div key={`${item.id}-time-${deliveryIndex}`} style={{ fontSize: 12, marginBottom: deliveryIndex === deliveries.length - 1 ? 0 : 6 }}>{formatDateTime(delivery.timestamp)}</div>) : timestamp}
                          </div>
                          <div style={{ display: "flex", justifyContent: "flex-end" }}>
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                void handleDeleteNotification(item);
                              }}
                              disabled={!canDelete}
                              style={{
                                border: "1px solid #f1f5f9",
                                borderRadius: 8,
                                background: canDelete ? "#fff1f2" : "#f8fafc",
                                color: canDelete ? "#b91c1c" : "#94a3b8",
                                padding: "8px 10px",
                                cursor: canDelete ? "pointer" : "not-allowed",
                                fontWeight: 600,
                                opacity: canDelete ? 1 : 0.8,
                              }}
                            >
                              Delete
                            </button>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          } />
          <Route path="templates" element={isAdmin ? <NotificationTemplatesPanel createTemplateSignal={createTemplateSignal} /> : <Navigate to="/notifications/logs" replace />} />
          <Route path="*" element={<Navigate to="logs" replace />} />
        </Routes>
      </div>
    </AdminLayout>
  );
}
