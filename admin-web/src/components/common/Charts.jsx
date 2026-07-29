import React from "react";
import { ResponsiveContainer, BarChart, Bar, XAxis, YAxis, Tooltip, Legend, Cell, PieChart, Pie, CartesianGrid } from "recharts";

function Card({ title, total, children, height = "100%" }) {
  return (
    <div className="glass-panel" style={{ borderRadius: "18px", padding: "22px", display: "flex", flexDirection: "column", transition: "transform 160ms ease, box-shadow 160ms ease", width: "100%", minHeight: "100%" }}>
      <div style={{ display: "flex", alignItems: "flex-start", justifyContent: "space-between", gap: "16px", marginBottom: "18px" }}>
        <div style={{ fontSize: "15px", fontWeight: 800, color: "var(--text)", lineHeight: 1.2, fontFamily: "Inter, system-ui, -apple-system, 'Segoe UI', Roboto, 'Helvetica Neue', Arial" }}>{title}</div>
        {total !== undefined ? (
          <div style={{ fontSize: "20px", fontWeight: 800, color: "var(--text)", whiteSpace: "nowrap" }}>{total}</div>
        ) : null}
      </div>
      <div style={{ height, flex: "1 1 auto", minHeight: 0 }}>{children}</div>
    </div>
  );
}

function NoData() {
  return (
    <div style={{ height: "100%", display: "flex", alignItems: "center", justifyContent: "center", color: "var(--muted)" }}>
      No Data Available
    </div>
  );
}

export function SocietyChart({ title = "Incidents per Society", data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card title={title}>
        <NoData />
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);

  return (
    <Card title={title} total={total}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart layout="vertical" data={data} margin={{ left: 18, right: 14, top: 6, bottom: 14 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis type="number" tick={{ fill: "#475569" }} axisLine={false} tickLine={false} />
          <YAxis dataKey="label" type="category" tick={{ fill: "#475569" }} width={160} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
          <Bar dataKey="value" name="Incidents" radius={[8, 8, 8, 8]} barSize={16}>
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color || "#2563eb"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function CategoryDonut({ title = "Incidents by Category", data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card title={title}>
        <NoData />
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  return (
    <Card title={title} total={total}>
      <ResponsiveContainer width="100%" height="100%">
        <PieChart>
          <Pie data={data} dataKey="value" nameKey="label" innerRadius={56} outerRadius={86} paddingAngle={4} labelLine={false} label={({ cx, cy, midAngle, innerRadius, outerRadius, percent, index }) => {
            const entry = data[index];
            return percent > 0.05 ? `${entry.label}` : null;
          }}>
            {data.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color || "#7c3aed"} />
            ))}
          </Pie>
          <Tooltip formatter={(value) => [value, "Incidents"]} cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
          <Legend verticalAlign="bottom" height={40} iconType="circle" wrapperStyle={{ fontSize: 12, color: "#475569" }} />
        </PieChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function HourBar({ title = "Incidents by Hour", data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card title={title}>
        <NoData />
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const sorted = [...data].sort((a, b) => {
    const pa = parseInt(String(a.label).split(":")[0], 10);
    const pb = parseInt(String(b.label).split(":")[0], 10);
    if (Number.isFinite(pa) && Number.isFinite(pb)) return pa - pb;
    return String(a.label).localeCompare(String(b.label));
  });

  return (
    <Card title={title} total={total}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fill: "#475569" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#475569" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
          <Bar dataKey="value" name="Incidents" radius={[8, 8, 0, 0]} barSize={18}>
            {sorted.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color || "#16a34a"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

export function DayBar({ title = "Incidents by Day", data = [] }) {
  if (!Array.isArray(data) || data.length === 0) {
    return (
      <Card title={title}>
        <NoData />
      </Card>
    );
  }

  const total = data.reduce((sum, item) => sum + Number(item.value || 0), 0);
  const order = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];
  const sorted = [...data].sort((a, b) => {
    const ia = order.indexOf(a.label);
    const ib = order.indexOf(b.label);
    if (ia === -1 || ib === -1) return String(a.label).localeCompare(String(b.label));
    return ia - ib;
  });

  return (
    <Card title={title} total={total}>
      <ResponsiveContainer width="100%" height="100%">
        <BarChart data={sorted} margin={{ left: 0, right: 12, top: 4, bottom: 8 }}>
          <CartesianGrid strokeDasharray="3 3" vertical={false} stroke="#e2e8f0" />
          <XAxis dataKey="label" tick={{ fill: "#475569" }} axisLine={false} tickLine={false} />
          <YAxis tick={{ fill: "#475569" }} axisLine={false} tickLine={false} />
          <Tooltip cursor={{ fill: "rgba(15, 23, 42, 0.04)" }} />
          <Bar dataKey="value" name="Incidents" radius={[8, 8, 0, 0]} barSize={18}>
            {sorted.map((entry, idx) => (
              <Cell key={`cell-${idx}`} fill={entry.color || "#d97706"} />
            ))}
          </Bar>
        </BarChart>
      </ResponsiveContainer>
    </Card>
  );
}

const ChartsExport = {
  SocietyChart,
  CategoryDonut,
  HourBar,
  DayBar,
};

export default ChartsExport;
