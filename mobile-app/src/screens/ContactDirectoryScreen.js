import React, { useCallback, useEffect, useMemo, useState } from "react";
import { ActivityIndicator, FlatList, RefreshControl, StyleSheet, Text, View } from "react-native";
import { useRouter } from "expo-router";
import { AppButton, AppScreen, AppTextInput, EmptyState, PageHeader, SectionCard, appColors } from "../components/common/designSystem";
import SearchableDropdown from "../components/common/SearchableDropdown";
import { api, getAuthHeaders, getStoredToken, getErrorMessage } from "../services/authService";

const ROLE_OPTIONS = [
  { label: "All roles", value: "" },
  { label: "Resident", value: "RESIDENT" },
  { label: "Guardian", value: "GUARDIAN" },
  { label: "Volunteer", value: "VOLUNTEER" },
  { label: "Security", value: "SECURITY" },
];
const PAGE_SIZE = 20;

function ContactCard({ contact }) {
  const displayName = contact.full_name || contact.name || contact.username || "Unknown";
  const displaySociety = contact.society || "Society unavailable";
  const displayBlockFlat = [contact.block, contact.flat].filter(Boolean).join(" • ") || "Block / flat unavailable";
  const displayPhone = contact.phone || "Phone unavailable";
  const displayRole = contact.role || "Role unavailable";

  return (
    <SectionCard style={styles.contactCard}>
      <View style={styles.contactHeader}>
        <Text style={styles.contactName}>{displayName}</Text>
        <Text style={styles.contactRole}>{displayRole}</Text>
      </View>
      <View style={styles.contactMetaRow}>
        <Text style={styles.contactMetaLabel}>Society</Text>
        <Text style={styles.contactMetaValue}>{displaySociety}</Text>
      </View>
      <View style={styles.contactMetaRow}>
        <Text style={styles.contactMetaLabel}>Block • Flat</Text>
        <Text style={styles.contactMetaValue}>{displayBlockFlat}</Text>
      </View>
      <View style={styles.contactMetaRow}>
        <Text style={styles.contactMetaLabel}>Phone</Text>
        <Text style={styles.contactMetaValue}>{displayPhone}</Text>
      </View>
    </SectionCard>
  );
}

export default function ContactDirectoryScreen() {
  console.log("RUNNING CONTACT DIRECTORY");
  const router = useRouter();
  const [contacts, setContacts] = useState([]);
  const [page, setPage] = useState(1);
  const [hasNextPage, setHasNextPage] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [searchText, setSearchText] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedRole, setSelectedRole] = useState("");
  const [error, setError] = useState("");

  const requestParams = useMemo(() => {
    const params = { page: 1, page_size: PAGE_SIZE };
    if (searchQuery.trim()) {
      params.search = searchQuery.trim();
    }
    if (selectedRole) {
      params.role = selectedRole;
    }
    return params;
  }, [searchQuery, selectedRole]);

  const loadContacts = useCallback(
    async ({ pageNumber = 1, replace = false, isRefresh = false } = {}) => {
      if (pageNumber === 1 && !isRefresh) {
        setLoading(true);
      }
      if (pageNumber > 1) {
        setLoadingMore(true);
      }
      if (isRefresh) {
        setRefreshing(true);
      }

      setError("");

      try {
        const token = await getStoredToken();
        const authHeaders = await getAuthHeaders(token);
        const requestUrl = "/users/contacts/";
        console.log("REQUEST PATH =", requestUrl);
        const response = await api.get(requestUrl, {
          headers: authHeaders,
          params: {
            ...requestParams,
            page: pageNumber,
          },
        });

        const data = response?.data || {};
        const results = Array.isArray(data.results) ? data.results : [];
        setContacts((prev) => (replace ? results : [...prev, ...results]));
        setPage(pageNumber);
        setHasNextPage(Boolean(data.next));
      } catch (err) {
        setError(getErrorMessage(err) || "Unable to load contact directory right now.");
      } finally {
        setLoading(false);
        setLoadingMore(false);
        setRefreshing(false);
      }
    },
    [requestParams]
  );

  const handleSearchSubmit = useCallback(() => {
    setSearchQuery(searchText.trim());
  }, [searchText]);

  useEffect(() => {
    const executeLoad = async () => {
      await loadContacts({ pageNumber: 1, replace: true });
    };
    void executeLoad();
  }, [searchQuery, selectedRole, loadContacts]);

  const handleRefresh = useCallback(() => {
    void loadContacts({ pageNumber: 1, replace: true, isRefresh: true });
  }, [loadContacts]);

  const handleLoadMore = useCallback(() => {
    if (loadingMore || loading || refreshing || !hasNextPage) {
      return;
    }
    void loadContacts({ pageNumber: page + 1, replace: false });
  }, [hasNextPage, loadContacts, loading, loadingMore, page, refreshing]);

  const handleRoleSelect = useCallback((option) => {
    setSelectedRole(option?.value || "");
  }, []);

  const handleClearFilters = useCallback(() => {
    setSearchText("");
    setSearchQuery("");
    setSelectedRole("");
  }, []);

  const renderFooter = useCallback(() => {
    if (!loadingMore) {
      return null;
    }
    return (
      <View style={styles.footer}> 
        <ActivityIndicator size="small" color={appColors.blue} />
      </View>
    );
  }, [loadingMore]);

  const listEmptyComponent = useMemo(() => {
    if (loading || refreshing) {
      return null;
    }

    if (error) {
      return (
        <EmptyState
          title="Unable to load contacts"
          message={error}
          action={<AppButton title="Retry" onPress={() => void loadContacts({ pageNumber: 1, replace: true })} />}
        />
      );
    }

    return (
      <EmptyState
        title="No contacts found"
        message="Try a different search or role filter."
        action={<AppButton title="Retry" onPress={handleRefresh} />}
      />
    );
  }, [error, handleRefresh, loadContacts, loading, refreshing]);

  const handleBack = useCallback(() => {
    if (router.canGoBack()) {
      router.back();
      return;
    }

    router.push("/(app)/dashboard");
  }, [router]);

  return (
    <AppScreen scrollable={false}>
      <PageHeader
        eyebrow="Contact directory"
        title="Contact Directory"
        subtitle="Search society contacts and view phone numbers safely."
        action={<AppButton title="Back" variant="secondary" onPress={handleBack} />}
      />

      <SectionCard style={styles.filterCard}>
        <AppTextInput
          label="Search"
          placeholder="Name, username, or phone"
          value={searchText}
          onChangeText={setSearchText}
          returnKeyType="search"
          onSubmitEditing={handleSearchSubmit}
        />
        <SearchableDropdown
          label="Role"
          placeholder="All roles"
          value={selectedRole}
          options={ROLE_OPTIONS}
          onSelect={handleRoleSelect}
        />
        <View style={styles.filterActionRow}>
          <AppButton title="Search" onPress={handleSearchSubmit} style={styles.filterButton} />
          <AppButton title="Clear" onPress={handleClearFilters} variant="secondary" style={styles.filterButton} />
        </View>
      </SectionCard>

      {loading && !refreshing ? (
        <View style={styles.loadingState}>
          <ActivityIndicator size="large" color={appColors.blue} />
          <Text style={styles.loadingText}>Loading contacts…</Text>
        </View>
      ) : (
        <FlatList
          data={contacts}
          keyExtractor={(item, index) => String(item?.id ?? `${item?.username ?? item?.phone ?? index}`) + `-${index}`}
          renderItem={({ item }) => <ContactCard contact={item} />}
          contentContainerStyle={[styles.listContainer, contacts.length === 0 && styles.emptyListContainer]}
          refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} tintColor={appColors.blue} />}
          onEndReached={handleLoadMore}
          onEndReachedThreshold={0.5}
          ListFooterComponent={renderFooter}
          ListEmptyComponent={listEmptyComponent}
          showsVerticalScrollIndicator={false}
        />
      )}
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  filterCard: { marginBottom: 14 },
  filterActionRow: { flexDirection: "row", gap: 10, marginTop: 10 },
  filterButton: { flex: 1 },
  listContainer: { paddingBottom: 32 },
  emptyListContainer: { flex: 1, justifyContent: "center" },
  loadingState: { flex: 1, justifyContent: "center", alignItems: "center", padding: 24 },
  loadingText: { marginTop: 12, color: appColors.slate, fontSize: 15, textAlign: "center" },
  footer: { paddingVertical: 18 },
  contactCard: { marginBottom: 14 },
  contactHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 10 },
  contactName: { fontSize: 16, fontWeight: "800", color: appColors.navy, flex: 1, marginRight: 10 },
  contactRole: { fontSize: 13, fontWeight: "700", color: appColors.blue, textTransform: "uppercase" },
  contactMetaRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 6 },
  contactMetaLabel: { color: appColors.muted, fontSize: 12, fontWeight: "700" },
  contactMetaValue: { color: appColors.navy, fontSize: 14, maxWidth: "65%", textAlign: "right" },
});
