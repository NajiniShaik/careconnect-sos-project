import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";

export default function SearchableDropdown({
  label,
  placeholder,
  value,
  options = [],
  onSelect,
  disabled = false,
  getLabel = (item) => item?.name || item?.label || item?.flat_number || "",
  getValue = (item) => item?.id || item?.value || "",
  emptyText = "No options available",
}) {
  const [visible, setVisible] = useState(false);
  const [search, setSearch] = useState("");

  const filteredOptions = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return options;

    return options.filter((item) => String(getLabel(item)).toLowerCase().includes(term));
  }, [getLabel, options, search]);

  const selectedLabel = useMemo(() => {
    if (value === null || value === undefined || value === "") {
      return "";
    }

    const match = options.find((item) => String(getValue(item)) === String(value));
    return match ? getLabel(match) : "";
  }, [getLabel, getValue, options, value]);

  return (
    <>
      <Text style={styles.label}>{label}</Text>
      <Pressable
        style={[styles.selector, disabled && styles.disabledSelector]}
        onPress={() => !disabled && setVisible(true)}
        disabled={disabled}
        accessibilityRole="button"
        accessibilityLabel={`${label} dropdown`}
      >
        <Text style={styles.selectorText}>{selectedLabel || placeholder}</Text>
      </Pressable>

      <Modal visible={visible} transparent animationType="slide" onRequestClose={() => setVisible(false)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{label}</Text>
            <TextInput
              style={styles.input}
              value={search}
              onChangeText={setSearch}
              placeholder={`Search ${label.toLowerCase()}`}
            />

            {filteredOptions.length > 0 ? (
              <FlatList
                data={filteredOptions}
                keyExtractor={(item, index) => `${getValue(item)}-${index}`}
                style={styles.list}
                renderItem={({ item }) => (
                  <Pressable
                    style={styles.optionItem}
                    onPress={() => {
                      onSelect?.(item);
                      setSearch("");
                      setVisible(false);
                    }}
                    accessibilityRole="button"
                    accessibilityLabel={`Select ${getLabel(item)}`}
                  >
                    <Text style={styles.optionText}>{getLabel(item)}</Text>
                  </Pressable>
                )}
              />
            ) : (
              <Text style={styles.emptyText}>{emptyText}</Text>
            )}

            <Pressable style={styles.closeButton} onPress={() => setVisible(false)}>
              <Text style={styles.closeButtonText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  label: { fontWeight: "600", marginBottom: 6, marginTop: 10 },
  selector: {
    borderWidth: 1,
    borderColor: "#ccc",
    borderRadius: 8,
    padding: 12,
    marginBottom: 8,
    backgroundColor: "#fff",
  },
  disabledSelector: { backgroundColor: "#f2f2f2" },
  selectorText: { color: "#111" },
  optionText: { color: "#111" },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  modalCard: { backgroundColor: "white", margin: 20, borderRadius: 12, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 10 },
  list: { maxHeight: 280 },
  optionItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
  emptyText: { color: "#666", paddingVertical: 10 },
  closeButton: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  closeButtonText: { color: "#0a84ff", fontWeight: "600" },
});
