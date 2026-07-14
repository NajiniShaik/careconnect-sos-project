import React, { useMemo, useState } from "react";
import { FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { appColors } from "./designSystem";

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
  label: { fontWeight: "700", marginBottom: 6, marginTop: 10, color: appColors.navy },
  selector: {
    borderWidth: 1,
    borderColor: appColors.border,
    borderRadius: 14,
    padding: 14,
    marginBottom: 8,
    backgroundColor: appColors.white,
  },
  disabledSelector: { backgroundColor: "#f8fafc" },
  selectorText: { color: appColors.navy, fontWeight: "600" },
  optionText: { color: appColors.navy },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  modalCard: { backgroundColor: appColors.white, margin: 20, borderRadius: 18, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10, color: appColors.navy },
  input: { borderWidth: 1, borderColor: appColors.border, borderRadius: 12, padding: 10, marginBottom: 10, backgroundColor: appColors.white },
  list: { maxHeight: 280 },
  optionItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: appColors.border },
  emptyText: { color: appColors.muted, paddingVertical: 10 },
  closeButton: { marginTop: 10, alignItems: "center", paddingVertical: 10 },
  closeButtonText: { color: appColors.blue, fontWeight: "700" },
});
