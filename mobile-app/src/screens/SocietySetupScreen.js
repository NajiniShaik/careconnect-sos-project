import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, Button, FlatList, Modal, Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { api, getErrorMessage } from "../services/authService";

export default function SocietySetupScreen() {
  const router = useRouter();
  const [societies, setSocieties] = useState([]);
  const [blocks, setBlocks] = useState([]);
  const [flats, setFlats] = useState([]);
  const [selectedSociety, setSelectedSociety] = useState(null);
  const [selectedBlock, setSelectedBlock] = useState(null);
  const [selectedFlat, setSelectedFlat] = useState(null);
  const [search, setSearch] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [activeModal, setActiveModal] = useState(null);
  const [error, setError] = useState("");

  const filteredSocieties = useMemo(() => {
    if (!search) return societies;
    return societies.filter((item) => item.name?.toLowerCase().includes(search.toLowerCase()));
  }, [societies, search]);

  const filteredBlocks = useMemo(() => {
    if (!selectedSociety) return [];
    return blocks.filter((item) => item.society === selectedSociety.id);
  }, [blocks, selectedSociety]);

  const filteredFlats = useMemo(() => {
    if (!selectedBlock) return [];
    return flats.filter((item) => item.block === selectedBlock.id && !item.is_occupied);
  }, [flats, selectedBlock]);

  const loadData = async () => {
    setLoading(true);
    setError("");
    try {
      const [societiesRes, blocksRes, flatsRes] = await Promise.all([
        api.get("/society/societies/"),
        api.get("/society/blocks/"),
        api.get("/society/flats/"),
      ]);
      setSocieties(societiesRes.data || []);
      setBlocks(blocksRes.data || []);
      setFlats(flatsRes.data || []);
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    let mounted = true;

    const runLoad = async () => {
      if (mounted) {
        await loadData();
      }
    };

    void runLoad();

    return () => {
      mounted = false;
    };
  }, []);

  const handleSubmit = async () => {
    if (!selectedSociety || !selectedBlock || !selectedFlat) {
      Alert.alert("Selection required", "Please choose a society, block, and flat.");
      return;
    }

    setSubmitting(true);
    try {
      await new Promise((resolve) => setTimeout(resolve, 200));
      router.replace("/dashboard");
    } catch (err) {
      Alert.alert("Setup failed", getErrorMessage(err));
    } finally {
      setSubmitting(false);
    }
  };

  const renderOptionList = () => {
    const data = activeModal === "society"
      ? filteredSocieties
      : activeModal === "block"
        ? filteredBlocks
        : filteredFlats;

    return (
      <View style={styles.modalContent}>
        <TextInput
          style={styles.input}
          placeholder={activeModal === "society" ? "Search society" : activeModal === "block" ? "Search block" : "Search flat"}
          value={search}
          onChangeText={setSearch}
        />
        <FlatList
          data={data}
          keyExtractor={(item) => String(item.id)}
          renderItem={({ item }) => (
            <Pressable
              style={styles.optionItem}
              onPress={() => {
                if (activeModal === "society") {
                  setSelectedSociety(item);
                  setSelectedBlock(null);
                  setSelectedFlat(null);
                } else if (activeModal === "block") {
                  setSelectedBlock(item);
                  setSelectedFlat(null);
                } else {
                  setSelectedFlat(item);
                }
                setActiveModal(null);
                setSearch("");
              }}
            >
              <Text>{activeModal === "society" ? item.name : activeModal === "block" ? item.name : item.flat_number}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  };

  return (
    <ScrollView contentContainerStyle={styles.container}>
      <Text style={styles.title}>Society setup</Text>
      <Text style={styles.subtitle}>Choose your society, block, and flat.</Text>

      {loading ? (
        <ActivityIndicator style={styles.loader} />
      ) : error ? (
        <Text style={styles.error}>{error}</Text>
      ) : (
        <View>
          <Text style={styles.label}>Society</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("society")}>
            <Text>{selectedSociety?.name || "Select society"}</Text>
          </Pressable>

          <Text style={styles.label}>Block / Tower</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("block")} disabled={!selectedSociety}>
            <Text>{selectedBlock?.name || "Select block"}</Text>
          </Pressable>

          <Text style={styles.label}>Flat</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("flat")} disabled={!selectedBlock}>
            <Text>{selectedFlat?.flat_number || "Select flat"}</Text>
          </Pressable>

          <View style={styles.buttonRow}>
            <Button title={submitting ? "Saving..." : "Save selection"} onPress={handleSubmit} disabled={submitting} />
          </View>
        </View>
      )}

      <Modal visible={Boolean(activeModal)} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose an option</Text>
            {renderOptionList()}
            <Button title="Close" onPress={() => setActiveModal(null)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 80 },
  title: { fontSize: 24, fontWeight: "700", marginBottom: 6 },
  subtitle: { fontSize: 16, color: "#666", marginBottom: 16 },
  label: { fontWeight: "600", marginTop: 10, marginBottom: 6, color: "#111" },
  selector: { borderWidth: 1, borderColor: "#d1d5db", borderRadius: 12, padding: 14, marginBottom: 8, backgroundColor: "#fff" },
  input: { borderWidth: 1, borderColor: "#ccc", borderRadius: 8, padding: 10, marginBottom: 10 },
  buttonRow: { marginTop: 20 },
  buttonWrapper: { borderRadius: 12, overflow: "hidden" },
  loader: { marginTop: 24 },
  error: { color: "#d32f2f", marginTop: 12 },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(0,0,0,0.35)" },
  modalCard: { backgroundColor: "white", margin: 20, borderRadius: 12, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "700", marginBottom: 10 },
  optionItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: "#eee" },
});
