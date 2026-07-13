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
import { getErrorMessage } from '../services/authService';
import { fetchSosHistory, getSosStatusLabel, triggerSosRequest } from '../services/sosService';

export default function SosScreen() {
  const router = useRouter();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState('');
  const [events, setEvents] = useState([]);

  const loadEvents = useCallback(async (isRefresh = false) => {
    if (!isRefresh) {
      setLoading(true);
    }
    setError('');

    try {
      const res = await fetchSosHistory();
      setEvents(Array.isArray(res?.data) ? res.data : []);
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
    Alert.alert(
      'Confirm SOS',
      'This will send an emergency alert. Continue?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Send',
          style: 'destructive',
          onPress: async () => {
            setSending(true);
            setError('');

            try {
              await triggerSosRequest();
              Alert.alert('SOS sent', 'Your emergency alert has been sent successfully.');
              await loadEvents(true);
            } catch (err) {
              setError(getErrorMessage(err));
              Alert.alert('SOS failed', getErrorMessage(err));
            } finally {
              setSending(false);
            }
          },
        },
      ]
    );
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

      <View style={styles.heroCard}>
        <Text style={styles.heroTitle}>Need urgent help?</Text>
        <Text style={styles.heroText}>Press the button below to trigger an SOS alert with your current status.</Text>
        <View style={styles.buttonRow}>
          <Button title={sending ? 'Sending…' : 'Send SOS'} onPress={handleSendSos} disabled={sending} />
        </View>
        {sending ? <ActivityIndicator style={styles.loader} /> : null}
      </View>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Recent alerts</Text>
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
        <Button title="Back to dashboard" onPress={() => router.replace('/dashboard')} />
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
  loader: { marginTop: 10 },
  card: { backgroundColor: '#fff', borderRadius: 16, padding: 16, marginBottom: 14, shadowColor: '#000', shadowOpacity: 0.05, shadowRadius: 6, elevation: 2 },
  cardTitle: { fontSize: 17, fontWeight: '700', marginBottom: 10 },
  helper: { color: '#666', marginTop: 4 },
  error: { color: '#d32f2f', marginBottom: 12 },
  eventItem: { borderBottomWidth: 1, borderBottomColor: '#f0f0f0', paddingVertical: 10 },
  eventStatus: { fontWeight: '700', color: '#b42318' },
  eventMessage: { fontWeight: '600', marginTop: 2 },
});
