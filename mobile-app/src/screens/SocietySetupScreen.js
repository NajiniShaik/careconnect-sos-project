import React, { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Alert, FlatList, Modal, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, SectionCard, StatusBadge, appColors } from "../components/common/designSystem";
import { api, getAuthHeaders, getErrorMessage, getStoredToken } from "../services/authService";

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
      const token = await getStoredToken();
      const authHeaders = await getAuthHeaders(token);
      const [societiesRes, blocksRes, flatsRes] = await Promise.all([
        api.get("/society/societies/", { headers: authHeaders }),
        api.get("/society/blocks/", { headers: authHeaders }),
        api.get("/society/flats/", { headers: authHeaders }),
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
              <Text style={styles.optionText}>{activeModal === "society" ? item.name : activeModal === "block" ? item.name : item.flat_number}</Text>
            </Pressable>
          )}
        />
      </View>
    );
  };

  return (
    <AppScreen>
      <PageHeader
        eyebrow="Residence setup"
        title="Society setup"
        subtitle="Choose your society, block, and flat in a few taps."
      />

      {loading ? (
        <SectionCard title="Loading options" subtitle="Fetching available societies and flats" style={styles.cardSpacing}>
          <ActivityIndicator style={styles.loader} color={appColors.blue} />
        </SectionCard>
      ) : error ? (
        <SectionCard title="Could not load options" subtitle="Please retry in a moment." style={styles.cardSpacing}>
          <Text style={styles.error}>{error}</Text>
        </SectionCard>
      ) : (
        <SectionCard title="Choose your address" subtitle="Your current selection will be used for your profile." style={styles.cardSpacing}>
          <Text style={styles.label}>Society</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("society")}>
            <Text style={styles.selectorText}>{selectedSociety?.name || "Select society"}</Text>
          </Pressable>

          <Text style={styles.label}>Block / Tower</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("block")} disabled={!selectedSociety}>
            <Text style={styles.selectorText}>{selectedBlock?.name || "Select block"}</Text>
          </Pressable>

          <Text style={styles.label}>Flat</Text>
          <Pressable style={styles.selector} onPress={() => setActiveModal("flat")} disabled={!selectedBlock}>
            <Text style={styles.selectorText}>{selectedFlat?.flat_number || "Select flat"}</Text>
          </Pressable>

          <View style={styles.summaryRow}>
            {selectedSociety ? <StatusBadge label={selectedSociety.name} tone="success" compact /> : null}
            {selectedBlock ? <StatusBadge label={selectedBlock.name} tone="warning" compact /> : null}
            {selectedFlat ? <StatusBadge label={selectedFlat.flat_number} tone="neutral" compact /> : null}
          </View>

          <AppButton title={submitting ? "Saving..." : "Save selection"} onPress={handleSubmit} loading={submitting} style={styles.buttonRow} />
        </SectionCard>
      )}

      {!loading && !error ? (
        <SectionCard title="Need a different address?" subtitle="You can reopen the selection flow anytime." style={styles.cardSpacing}>
          <EmptyState title="Ready when you are" message="Changes here only affect the local setup experience in this app." icon="home-outline" />
        </SectionCard>
      ) : null}

      <Modal visible={Boolean(activeModal)} transparent animationType="slide" onRequestClose={() => setActiveModal(null)}>
        <View style={styles.modalOverlay}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Choose an option</Text>
            {renderOptionList()}
            <AppButton title="Close" onPress={() => setActiveModal(null)} variant="secondary" style={styles.closeButton} />
          </View>
        </View>
      </Modal>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  cardSpacing: { marginBottom: 14 },
  label: { fontWeight: "700", marginTop: 8, marginBottom: 6, color: appColors.navy },
  selector: { borderWidth: 1, borderColor: appColors.border, borderRadius: 14, padding: 14, marginBottom: 8, backgroundColor: appColors.white },
  selectorText: { color: appColors.navy, fontWeight: "600" },
  input: { borderWidth: 1, borderColor: appColors.border, borderRadius: 12, padding: 12, marginBottom: 10, backgroundColor: appColors.white },
  buttonRow: { marginTop: 18 },
  loader: { marginTop: 12 },
  error: { color: appColors.red, marginTop: 6 },
  summaryRow: { flexDirection: "row", flexWrap: "wrap", marginTop: 12 },
  modalOverlay: { flex: 1, justifyContent: "center", backgroundColor: "rgba(15, 23, 42, 0.4)" },
  modalCard: { backgroundColor: appColors.white, margin: 20, borderRadius: 18, padding: 16, maxHeight: "80%" },
  modalTitle: { fontSize: 18, fontWeight: "800", marginBottom: 10, color: appColors.navy },
  modalContent: { flexGrow: 1 },
  optionItem: { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: appColors.border },
  optionText: { color: appColors.navy, fontWeight: "600" },
  closeButton: { marginTop: 12 },
});
