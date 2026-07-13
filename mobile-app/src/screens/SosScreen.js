import React, { useCallback, useEffect, useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Button,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from 'react-native';
import { useRouter } from 'expo-router';
import { getErrorMessage, getStoredUser } from '../services/authService';
import { buildSosRequestPayload, fetchSosHistory, getSosStatusLabel, mergeSosEvents, normalizeSosEvent, triggerSosRequest } from '../services/sosService';

export default function SosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [statusMessage, setStatusMessage] = useState('');
  const [events, setEvents] = useState([]);
  const [currentUser, setCurrentUser] = useState(null);

  useEffect(() => {
    let mounted = true;

    const loadUser = async () => {
      const storedUser = await getStoredUser();
      if (mounted) {
        setCurrentUser(storedUser);
      }
    };

    void loadUser();

    return () => {
      mounted = false;
    };
  }, []);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }
    setError('');

    try {
      const res = await fetchSosHistory();
      const historyEvents = Array.isArray(res?.data) ? res.data : [];
      setEvents((prevEvents) => (historyEvents.length === 0 ? prevEvents : historyEvents));
    } catch (err) {
      setError(getErrorMessage(err));
    } finally {
      if (!isRefresh) {
        setLoading(false);
      }
      setRefreshing(false);
    }
  }, []);

  useEffect(() => {
    let mounted = true;

    const runLoad = async () => {
      if (mounted) {
        await loadEvents();
      }
    };

    void runLoad();

    return () => {
      mounted = false;
    };
  }, [loadEvents]);

  const handleSendSos = async () => {
    const role = currentUser?.role?.toUpperCase();

    if (role !== 'RESIDENT') {
      const message = 'SOS alerts are available for resident accounts only.';
      setError(message);
      setStatusMessage(message);
      Alert.alert('Access restricted', message);
      return;
    }

    setSending(true);
    setError('');
    setStatusMessage('Sending SOS alert...');

    try {
      const payload = buildSosRequestPayload('Emergency alert triggered from mobile app', 'UNKNOWN');
      const response = await triggerSosRequest(payload);
      const createdEvent = normalizeSosEvent(response?.data || {});

      setEvents((prev) => mergeSosEvents(createdEvent, prev));
      setStatusMessage(response?.data?.message || 'SOS sent successfully.');
      Alert.alert('SOS sent', 'Your emergency alert has been sent successfully.');
      await loadEvents(true);
    } catch (err) {
      const message = err?.response?.status === 403
        ? 'Your account is not permitted to send SOS alerts right now.'
        : getErrorMessage(err);
      setError(message);
      setStatusMessage(`SOS send failed: ${message}`);
      Alert.alert('SOS failed', message);
    } finally {
      setSending(false);
    }
  };

  const onRefresh = useCallback(() => {
    setRefreshing(true);
    loadEvents(true);
  }, [loadEvents]);

  return (
    <ScrollView
      contentContainerStyle={styles.container}
      refreshControl={<RefreshControl refreshing={refreshing} onRefresh={onRefresh} />}
    >
      <Text style={styles.title}>SOS</Text>
      <Text style={styles.subtitle}>Send an emergency alert and review recent alerts.</Text>
      {currentUser ? (
        <Text style={styles.helper}>Logged in as {currentUser.email || currentUser.username} ({currentUser.role})</Text>
      ) : (
        <Text style={styles.helper}>Loading resident details...</Text>
      )}

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Need urgent help?</Text>
        <Text style={styles.heroText}>Press the button below to trigger an SOS alert with your current status.</Text>
        <View style={styles.buttonRow}>
          <View style={styles.buttonWrapper}>
            <Button title={sending ? 'Sending…' : 'Send SOS'} onPress={handleSendSos} disabled={sending || currentUser?.role?.toUpperCase() !== 'RESIDENT'} />
          </View>
        </View>
        {statusMessage ? <Text style={styles.status}>{statusMessage}</Text> : null}
        {currentUser ? (
          currentUser?.role?.toUpperCase() !== 'RESIDENT' ? (
            <Text style={styles.helper}>SOS alerts are available for resident accounts only.</Text>
          ) : null
        ) : (
          <Text style={styles.helper}>Loading user details...</Text>
        )}
        {sending ? <ActivityIndicator style={styles.loader} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent alerts</Text>
        <Text style={styles.helper}>Loaded alerts: {events.length}</Text>
        {loading ? (
          <ActivityIndicator style={styles.loader} />
        ) : events.length === 0 ? (
          <Text style={styles.helper}>No SOS activity yet.</Text>
        ) : (
          events.map((item) => (
            <View key={item.id || `${item.status}-${item.created_at}`} style={styles.eventItem}>
              <Text style={styles.eventStatus}>{getSosStatusLabel(item.status)}</Text>
              <Text style={styles.eventMessage}>{item.message || 'Emergency alert'}</Text>
              <Text style={styles.helper}>{item.location || 'Location unavailable'}</Text>
              <Text style={styles.helper}>{item.created_at || 'Recently created'}</Text>
            </View>
          ))
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.buttonWrapper}>
          <Button title="Back to dashboard" onPress={() => router.replace('/dashboard')} />
        </View>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  container: { padding: 20, paddingTop: 60, paddingBottom: 80 },
  title: { fontSize: 28, fontWeight: '700', marginBottom: 4 },
  subtitle: { fontSize: 15, color: '#666', marginBottom: 16 },
  heroCard: { backgroundColor: '#fff', borderRadius: 16, padding: 18, marginBottom: 16, shadowColor: '#000', shadowOpacity: 0.06, shadowRadius: 8, elevation: 2 },
  heroTitle: { fontSize: 20, fontWeight: '700', color: '#b42318', marginBottom: 6 },
  heroText: { fontSize: 14, color: '#555', marginBottom: 12 },
  buttonRow: { marginTop: 8 },
  buttonWrapper: { borderRadius: 12, overflow: 'hidden' },
  loader: { marginTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  helper: { color: '#666', marginTop: 4 },
  status: { color: '#166534', marginBottom: 12, padding: 10, borderRadius: 12, backgroundColor: '#ecfdf5' },
  error: { color: '#d32f2f', marginBottom: 12, padding: 10, borderRadius: 12, backgroundColor: '#fef2f2' },
  eventItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 12, paddingHorizontal: 8, marginBottom: 8, borderRadius: 12, backgroundColor: '#fafafa' },
  eventStatus: { fontWeight: '700', color: '#b42318' },
  eventMessage: { fontWeight: '600', marginTop: 2 },
});
