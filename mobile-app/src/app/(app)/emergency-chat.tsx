import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { AppButton, AppScreen, EmptyState, PageHeader, appColors } from "../../components/common/designSystem";
import { getStoredUser, getStoredToken } from "../../services/authService";
import { buildChatSocketUrl, fetchChatHistory, postChatMessage } from "../../services/chatService";

function formatChatTimestamp(value) {
  if (!value) {
    return "";
  }

  const dateValue = new Date(value);
  if (Number.isNaN(dateValue.getTime())) {
    return value;
  }

  return dateValue.toLocaleString();
}

function normalizeChatMessages(messages = []) {
  return Array.isArray(messages) ? messages : [];
}

export default function EmergencyChatScreen() {
  const params = useLocalSearchParams();
  const router = useRouter();
  const incidentId = useMemo(() => String(params?.incident_id || params?.incidentId || params?.id || "").trim(), [params]);

  const [user, setUser] = useState(null);
  const [messages, setMessages] = useState([]);
  const [draft, setDraft] = useState("");
  const [loading, setLoading] = useState(true);
  const [sending, setSending] = useState(false);
  const [error, setError] = useState("");
  const [socketConnected, setSocketConnected] = useState(false);
  const [socketError, setSocketError] = useState("");

  const scrollRef = useRef(null);
  const socketRef = useRef(null);
  const retryTimerRef = useRef(null);
  const retryCountRef = useRef(0);
  const shouldReconnectRef = useRef(true);
  const connectSocketRef = useRef(null);

  const loadHistory = useCallback(async () => {
    if (!incidentId) {
      setLoading(false);
      setError("Incident id is missing.");
      return;
    }

    setLoading(true);
    setError("");

    try {
      const response = await fetchChatHistory(incidentId);
      const nextMessages = normalizeChatMessages(response?.data || []);
      setMessages(nextMessages);
      if (nextMessages.length === 0) {
        setError("");
      }
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("You are not authorized to view this incident chat.");
      } else {
        setError("Unable to load chat history right now.");
      }
    } finally {
      setLoading(false);
    }
  }, [incidentId]);

  const connectSocket = useCallback(async () => {
    if (!incidentId) {
      return;
    }

    shouldReconnectRef.current = true;

    const accessToken = await getStoredToken();
    const socketUrl = buildChatSocketUrl(
      incidentId,
      globalThis?.process?.env?.EXPO_PUBLIC_API_BASE_URL || globalThis?.process?.env?.API_BASE_URL || "",
      accessToken,
    );
    if (!socketUrl) {
      setSocketError("Real-time chat is unavailable in this environment.");
      return;
    }

    if (socketRef.current) {
      socketRef.current.close();
      socketRef.current = null;
    }

    setSocketError("");

    try {
      const socket = new WebSocket(socketUrl);
      socketRef.current = socket;
      const currentSocket = socket;

      socket.onopen = () => {
        if (!shouldReconnectRef.current || socketRef.current !== currentSocket) {
          return;
        }
        setSocketConnected(true);
        setSocketError("");
        retryCountRef.current = 0;
      };

      socket.onmessage = (event) => {
        if (socketRef.current !== currentSocket) {
          return;
        }
        try {
          const payload = JSON.parse(event.data || "{}");
          const incoming = payload?.message || payload || null;
          if (incoming && incoming.id) {
            setMessages((prev) => {
              const exists = prev.some((item) => String(item.id) === String(incoming.id));
              if (exists) {
                return prev;
              }
              return [...prev, incoming];
            });
          }
        } catch {
          // ignore invalid socket payloads
        }
      };

      socket.onerror = () => {
        if (socketRef.current !== currentSocket) {
          return;
        }
        setSocketConnected(false);
        setSocketError("Realtime connection failed.");
      };

      socket.onclose = () => {
        if (socketRef.current !== currentSocket) {
          return;
        }
        setSocketConnected(false);
        if (!shouldReconnectRef.current) {
          return;
        }

        setSocketError("Realtime connection lost. Retrying...");
        if (!retryTimerRef.current) {
          retryCountRef.current = Math.min(retryCountRef.current + 1, 10);
          const nextDelay = Math.min(3000 + retryCountRef.current * 1000, 10000);
          retryTimerRef.current = setTimeout(() => {
            retryTimerRef.current = null;
            if (shouldReconnectRef.current) {
              connectSocketRef.current?.();
            }
          }, nextDelay);
        }
      };
    } catch {
      setSocketError("Realtime connection failed.");
    }
  }, [incidentId]);

  useEffect(() => {
    connectSocketRef.current = connectSocket;
  }, [connectSocket]);

  useEffect(() => {
    let isMounted = true;

    const initialize = async () => {
      try {
        const storedUser = await getStoredUser();
        if (isMounted) {
          setUser(storedUser);
        }
      } catch {
        if (isMounted) {
          setUser(null);
        }
      }

      if (!isMounted) {
        return;
      }

      await loadHistory();
      shouldReconnectRef.current = true;
      connectSocket();
    };

    void initialize();

    return () => {
      isMounted = false;
      shouldReconnectRef.current = false;
      if (retryTimerRef.current) {
        clearTimeout(retryTimerRef.current);
        retryTimerRef.current = null;
      }
      if (socketRef.current) {
        socketRef.current.close();
        socketRef.current = null;
      }
    };
  }, [connectSocket, incidentId, loadHistory]);

  useEffect(() => {
    const timer = setTimeout(() => {
      if (scrollRef.current) {
        scrollRef.current.scrollToEnd({ animated: true });
      }
    }, 80);

    return () => clearTimeout(timer);
  }, [messages, loading]);

  const handleSend = useCallback(async () => {
    const trimmed = draft.trim();
    if (!trimmed) {
      setError("Enter a message before sending.");
      return;
    }

    if (!incidentId) {
      setError("Incident id is missing.");
      return;
    }

    setSending(true);
    setError("");

    try {
      const response = await postChatMessage(incidentId, trimmed);
      const createdMessage = response?.data || null;
      if (createdMessage) {
        setMessages((prev) => {
          const exists = prev.some((item) => String(item.id) === String(createdMessage.id));
          if (exists) {
            return prev;
          }
          return [...prev, createdMessage];
        });
      }
      setDraft("");
    } catch (err) {
      const status = err?.response?.status;
      if (status === 401 || status === 403) {
        setError("You are not authorized to send messages in this chat.");
      } else if (status === 400) {
        setError("Enter a message before sending.");
      } else {
        setError("Unable to send the message right now.");
      }
    } finally {
      setSending(false);
    }
  }, [draft, incidentId]);

  const handleBack = useCallback(() => {
    router.replace({ pathname: "/(app)/alerts" });
  }, [router]);

  const currentUserId = String(user?.id || "");

  return (
    <AppScreen scrollable={false} background="default">
      <KeyboardAvoidingView style={styles.container} behavior={Platform.OS === "ios" ? "padding" : undefined} keyboardVerticalOffset={90}>
        <PageHeader
          title="Emergency Chat"
          subtitle={incidentId ? `Incident #${incidentId}` : "Live incident conversation"}
          action={<AppButton title="Back" variant="ghost" onPress={handleBack} />}
        />

        {socketError ? (
          <View style={styles.notice}><Text style={styles.noticeText}>{socketError}</Text></View>
        ) : socketConnected ? (
          <View style={styles.notice}><Text style={styles.noticeText}>Realtime chat connected.</Text></View>
        ) : null}

        {loading ? (
          <View style={styles.loadingState}><ActivityIndicator size="large" color={appColors.blue} /><Text style={styles.loadingText}>Loading chat history…</Text></View>
        ) : null}

        {!loading && messages.length === 0 ? (
          <EmptyState title="No messages yet" message="Start the conversation for this incident." icon="chatbubble-outline" />
        ) : null}

        {!loading && messages.length > 0 ? (
          <ScrollView ref={scrollRef} style={styles.messageList} contentContainerStyle={styles.messageListContent} keyboardShouldPersistTaps="handled">
            {messages.map((message) => {
              const isMine = String(message?.sender?.id || "") === currentUserId;
              return (
                <View key={message.id || `${message.created_at}-${message.message}`} style={[styles.messageRow, isMine ? styles.messageRowMine : styles.messageRowOther]}>
                  <View style={[styles.messageBubble, isMine ? styles.messageBubbleMine : styles.messageBubbleOther]}>
                    <Text style={[styles.messageSender, isMine ? styles.messageSenderMine : styles.messageSenderOther]}>
                      {message?.sender?.username || "User"} • {message?.sender?.role || "User"}
                    </Text>
                    <Text style={styles.messageText}>{message?.message || ""}</Text>
                    <Text style={[styles.messageMeta, isMine ? styles.messageMetaMine : styles.messageMetaOther]}>{formatChatTimestamp(message?.created_at)}</Text>
                  </View>
                </View>
              );
            })}
          </ScrollView>
        ) : null}

        <View style={styles.inputBar}>
          {error ? <Text style={styles.errorText}>{error}</Text> : null}
          <View style={styles.inputRow}>
            <TextInput
              style={styles.input}
              value={draft}
              onChangeText={setDraft}
              placeholder="Type a message"
              multiline
              maxLength={500}
            />
            <AppButton title={sending ? "Sending..." : "Send"} disabled={sending} loading={sending} onPress={() => void handleSend()} style={styles.sendButton} />
          </View>
        </View>
      </KeyboardAvoidingView>
    </AppScreen>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1 },
  loadingState: { flex: 1, justifyContent: "center", alignItems: "center", paddingVertical: 24 },
  loadingText: { marginTop: 10, color: appColors.muted },
  notice: { backgroundColor: appColors.blueSoft, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, marginBottom: 10 },
  noticeText: { color: appColors.blue, fontSize: 13 },
  messageList: { flex: 1 },
  messageListContent: { paddingBottom: 16 },
  messageRow: { marginBottom: 10, flexDirection: "row" },
  messageRowMine: { justifyContent: "flex-end" },
  messageRowOther: { justifyContent: "flex-start" },
  messageBubble: { maxWidth: "85%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 10 },
  messageBubbleMine: { backgroundColor: appColors.blue, borderBottomRightRadius: 4 },
  messageBubbleOther: { backgroundColor: appColors.white, borderBottomLeftRadius: 4 },
  messageSender: { fontSize: 12, fontWeight: "700", marginBottom: 4 },
  messageSenderMine: { color: appColors.white },
  messageSenderOther: { color: appColors.blue },
  messageText: { fontSize: 14, lineHeight: 20, color: appColors.navy },
  messageMeta: { fontSize: 11, marginTop: 6 },
  messageMetaMine: { color: appColors.white },
  messageMetaOther: { color: appColors.muted },
  inputBar: { paddingTop: 10, borderTopWidth: 1, borderTopColor: appColors.border },
  inputRow: { flexDirection: "row", alignItems: "flex-end", gap: 10 },
  input: { flex: 1, borderWidth: 1, borderColor: appColors.border, borderRadius: 14, paddingHorizontal: 12, paddingVertical: 10, minHeight: 44, backgroundColor: appColors.white, color: appColors.navy },
  sendButton: { minWidth: 92 },
  errorText: { color: appColors.red, fontSize: 12, marginBottom: 8 },
});
